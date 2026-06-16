import { type ByteReader, createByteReader } from '../../shared/byte-reader.ts';
import { InvalidMp3Error } from '../../shared/errors.ts';
import {
  type FrameHeader,
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

const FRAME_HEADER_BYTES = 4;
const ID3V2_HEADER_BYTES = 10;
const MPEG_VERSION_1 = 0b11; // version bits (20-19)
const LAYER_III = 0b01; // layer bits (18-17)
const BITS_PER_BYTE = 8;

/**
 * Decode the 4-byte frame header into the fields needed to size the frame, or
 * return null if these bytes are not a valid MPEG-1 Layer III header. Only the
 * first three bytes matter for counting; byte 4 carries channel info we ignore.
 *
 * Header bit layout (big-endian): byte0 = bits 31-24, byte1 = 23-16, byte2 = 15-8.
 */
export const parseMp3FrameHeader = (header: Uint8Array): FrameHeader | null => {
  if (header.length < FRAME_HEADER_BYTES) {
    return null;
  }
  const b0 = header[0] ?? 0;
  const b1 = header[1] ?? 0;
  const b2 = header[2] ?? 0;

  // Frame sync: 11 bits all set -> byte 0 is 0xFF and the top 3 bits of byte 1 are 1.
  if (b0 !== 0xff || (b1 & 0b1110_0000) !== 0b1110_0000) {
    return null;
  }
  // In scope: MPEG Version 1 (bits 20-19 = 11) and Layer III (bits 18-17 = 01).
  if (((b1 >> 3) & 0b11) !== MPEG_VERSION_1 || ((b1 >> 1) & 0b11) !== LAYER_III) {
    return null;
  }

  const bitrateKbps = MPEG1_LAYER3_BITRATES_KBPS[(b2 >> 4) & 0b1111];
  const sampleRateHz = MPEG1_SAMPLE_RATES_HZ[(b2 >> 2) & 0b11];
  // A "free"/"bad" bitrate or the reserved sample rate is not a frame we can size.
  if (bitrateKbps == null || sampleRateHz == null) {
    return null;
  }

  const padding = ((b2 >> 1) & 0b1) as 0 | 1;
  return { bitrateKbps, sampleRateHz, padding };
};

/**
 * Frame length in bytes for MPEG-1 Layer III:
 *   floor(samplesPerFrame / 8 * bitrate / sampleRate) + padding
 * where samplesPerFrame / 8 = 1152 / 8 = the well-known "144".
 */
export const frameLength = ({ bitrateKbps, sampleRateHz, padding }: FrameHeader): number =>
  Math.floor(
    (MPEG1_LAYER3_SAMPLES_PER_FRAME * bitrateKbps * 1000) / (BITS_PER_BYTE * sampleRateHz),
  ) + padding;

/**
 * If the stream starts with an ID3v2 tag ("ID3"), skip past it so the first
 * thing we parse is real audio. The tag size is a 28-bit "syncsafe" integer
 * (the high bit of each of the four size bytes is always 0).
 */
const skipId3v2Tag = async (reader: ByteReader): Promise<void> => {
  const head = await reader.peek(ID3V2_HEADER_BYTES);
  if (head === null || head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) {
    return; // no ID3v2 tag - leave the stream untouched
  }
  // peek guarantees ID3V2_HEADER_BYTES bytes here, so these indexes are present.
  const flags = head[5] ?? 0;
  const size =
    ((head[6] ?? 0) << 21) | ((head[7] ?? 0) << 14) | ((head[8] ?? 0) << 7) | (head[9] ?? 0);
  const footerBytes = (flags & 0b0001_0000) !== 0 ? ID3V2_HEADER_BYTES : 0;
  await reader.discard(ID3V2_HEADER_BYTES + size + footerBytes);
};

export const createMp3FrameParser = (): Mp3FrameParser => ({
  async count(source: AsyncIterable<Uint8Array>): Promise<number> {
    const reader = createByteReader(source);
    await skipId3v2Tag(reader);

    let frames = 0;
    for (;;) {
      const header = await reader.peek(FRAME_HEADER_BYTES);
      if (header === null) {
        break; // fewer than 4 bytes remain -> end of stream
      }

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
