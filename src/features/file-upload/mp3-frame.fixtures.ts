import {
  BITS_PER_BYTE,
  BITS_PER_KILOBIT,
  FRAME_HEADER,
  MPEG1_LAYER3_BITRATES_KBPS,
  MPEG1_LAYER3_SAMPLES_PER_FRAME,
  MPEG1_SAMPLE_RATES_HZ,
} from './mp3.models.ts';

// Header byte-1 bit 0 is the protection flag; the parser ignores it, and 1 means "no CRC".
const NO_CRC = 0b1;

/**
 * Shared test fixture: build one valid MPEG-1 Layer III frame (a correct 4-byte header +
 * zero-filled payload) using the same `mp3.models.ts` constants the parser decodes with -
 * i.e. the exact inverse of `parseMp3FrameHeader`, so there are no magic values here.
 */
export function buildFrame(
  bitrateKbps = 128,
  sampleRateHz = 44100,
  padding: 0 | 1 = 0,
): Uint8Array {
  const bitrateIndex = MPEG1_LAYER3_BITRATES_KBPS.indexOf(bitrateKbps);
  const sampleRateIndex = MPEG1_SAMPLE_RATES_HZ.indexOf(sampleRateHz);
  const length =
    Math.floor(
      (MPEG1_LAYER3_SAMPLES_PER_FRAME * bitrateKbps * BITS_PER_KILOBIT) /
        (BITS_PER_BYTE * sampleRateHz),
    ) + padding;

  const frame = new Uint8Array(length);
  frame[0] = FRAME_HEADER.SYNC_BYTE_0;
  frame[1] =
    FRAME_HEADER.SYNC_BYTE_1_MASK |
    (FRAME_HEADER.VERSION_MPEG_1 << FRAME_HEADER.VERSION_SHIFT) |
    (FRAME_HEADER.LAYER_III << FRAME_HEADER.LAYER_SHIFT) |
    NO_CRC;
  frame[2] =
    (bitrateIndex << FRAME_HEADER.BITRATE_INDEX_SHIFT) |
    (sampleRateIndex << FRAME_HEADER.SAMPLE_RATE_INDEX_SHIFT) |
    (padding << FRAME_HEADER.PADDING_SHIFT);
  frame[3] = 0x00; // channel/emphasis bits - not read by the parser
  return frame;
}
