import { type ByteReader, createByteReader } from '../../shared/byte-reader.ts';
import { InvalidMp3Error } from '../../shared/errors.ts';
import {
  BITS_PER_BYTE,
  BITS_PER_KILOBIT,
  FRAME_HEADER,
  type FrameHeader,
  ID3V2,
  MPEG1_LAYER3_BITRATES_KBPS,
  MPEG1_LAYER3_SAMPLES_PER_FRAME,
  MPEG1_SAMPLE_RATES_HZ,
} from './mp3.models.ts';

/** Counts the audio frames in an MP3 byte stream. */
export interface Mp3FrameParser {
  /**
   * Count MPEG-1 Audio Layer III frames in a stream of byte chunks.
   * Consumes the stream lazily - it must not buffer the whole input.
   */
  count(source: AsyncIterable<Uint8Array>): Promise<number>;
}

/**
 * Decode the 4-byte frame header into the fields needed to size the frame, or
 * return null if these bytes are not a valid MPEG-1 Layer III header. Only the
 * first three bytes matter for counting; byte 4 carries channel info we ignore.
 * See FRAME_HEADER in ./mp3.models.ts for the bit layout these masks reference.
 */
export const parseMp3FrameHeader = (header: Uint8Array): FrameHeader | null => {
  if (header.length < FRAME_HEADER.BYTES) {
    return null;
  }
  // The three header bytes that carry every field we read.
  const byte0 = header[0] ?? 0;
  const byte1 = header[1] ?? 0;
  const byte2 = header[2] ?? 0;

  // Frame sync: 11 bits all set.
  if (
    byte0 !== FRAME_HEADER.SYNC_BYTE_0 ||
    (byte1 & FRAME_HEADER.SYNC_BYTE_1_MASK) !== FRAME_HEADER.SYNC_BYTE_1_MASK
  ) {
    return null;
  }
  // In scope: MPEG Version 1 and Layer III.
  if (
    ((byte1 >> FRAME_HEADER.VERSION_SHIFT) & FRAME_HEADER.VERSION_MASK) !==
      FRAME_HEADER.VERSION_MPEG_1 ||
    ((byte1 >> FRAME_HEADER.LAYER_SHIFT) & FRAME_HEADER.LAYER_MASK) !== FRAME_HEADER.LAYER_III
  ) {
    return null;
  }

  // Table indices decoded from byte 2.
  const bitrateIndex =
    (byte2 >> FRAME_HEADER.BITRATE_INDEX_SHIFT) & FRAME_HEADER.BITRATE_INDEX_MASK;
  const sampleRateIndex =
    (byte2 >> FRAME_HEADER.SAMPLE_RATE_INDEX_SHIFT) & FRAME_HEADER.SAMPLE_RATE_INDEX_MASK;
  // Decoded bitrate / sample rate (null for free/bad/reserved values).
  const bitrateKbps = MPEG1_LAYER3_BITRATES_KBPS[bitrateIndex];
  const sampleRateHz = MPEG1_SAMPLE_RATES_HZ[sampleRateIndex];
  if (bitrateKbps == null || sampleRateHz == null) {
    return null;
  }

  // Padding bit: adds one extra byte to this frame when set.
  const padding = ((byte2 >> FRAME_HEADER.PADDING_SHIFT) & FRAME_HEADER.PADDING_MASK) as 0 | 1;
  return { bitrateKbps, sampleRateHz, padding };
};

/** Frame length in bytes for MPEG-1 Layer III (see the formula in ./mp3.models.ts). */
export const frameLength = ({ bitrateKbps, sampleRateHz, padding }: FrameHeader): number =>
  Math.floor(
    (MPEG1_LAYER3_SAMPLES_PER_FRAME * bitrateKbps * BITS_PER_KILOBIT) /
      (BITS_PER_BYTE * sampleRateHz),
  ) + padding;

/**
 * If the stream starts with an ID3v2 tag ("ID3"), skip past it so the first
 * thing we parse is real audio. The tag size is a syncsafe integer - 7 usable
 * bits per byte - so it never collides with a frame sync.
 */
const skipId3v2Tag = async (reader: ByteReader): Promise<void> => {
  // The 10-byte ID3v2 header, or null if the stream is shorter.
  const head = await reader.peek(ID3V2.HEADER_BYTES);
  if (
    head === null ||
    head[0] !== ID3V2.MAGIC[0] ||
    head[1] !== ID3V2.MAGIC[1] ||
    head[2] !== ID3V2.MAGIC[2]
  ) {
    return; // no ID3v2 tag - leave the stream untouched
  }

  // Tag body size, reassembled from the syncsafe size field.
  let size = 0;
  for (let i = 0; i < ID3V2.SIZE_BYTES; i += 1) {
    // One syncsafe size byte (only its low 7 bits count).
    const sizeByte = head[ID3V2.SIZE_OFFSET + i] ?? 0;
    size = (size << ID3V2.SYNCSAFE_BITS_PER_BYTE) | (sizeByte & ID3V2.SYNCSAFE_BYTE_MASK);
  }
  // Whether a 10-byte footer trails the tag.
  const hasFooter = ((head[ID3V2.FLAGS_OFFSET] ?? 0) & ID3V2.FOOTER_FLAG) !== 0;
  // Extra bytes to skip for that optional footer.
  const footerBytes = hasFooter ? ID3V2.HEADER_BYTES : 0;
  await reader.discard(ID3V2.HEADER_BYTES + size + footerBytes);
};

/** Build the streaming MP3 frame parser. */
export const createMp3FrameParser = (): Mp3FrameParser => ({
  async count(source: AsyncIterable<Uint8Array>): Promise<number> {
    // Streaming reader over the upload.
    const reader = createByteReader(source);
    await skipId3v2Tag(reader);

    // Running count of valid frames seen so far.
    let frames = 0;
    for (;;) {
      // The next candidate 4-byte header, or null at end of stream.
      const header = await reader.peek(FRAME_HEADER.BYTES);
      if (header === null) {
        break; // fewer than 4 bytes remain -> end of stream
      }

      // The decoded header, or null if these bytes are not a valid frame.
      const parsed = parseMp3FrameHeader(header);
      if (parsed === null) {
        // Not a frame boundary (leading junk, an ID3v1/APE trailer, corruption):
        // advance one byte and re-sync. Once aligned, each frame's computed length
        // lands us exactly on the next header, so there are no false positives.
        await reader.discard(1);
        continue;
      }

      // A valid header counts as a frame - including a VBR file's leading Xing/Info
      // frame (we count by structure, which matches `mediainfo --fullscan`) and a final
      // frame whose body is truncated at end-of-stream.
      frames += 1;
      await reader.discard(frameLength(parsed));
    }

    if (frames === 0) {
      throw new InvalidMp3Error('No MPEG-1 Audio Layer III frames found in the upload.');
    }
    return frames;
  },
});
