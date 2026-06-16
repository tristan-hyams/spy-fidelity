/** The API response payload for `POST /file-upload`. */
export interface FrameCountResult {
  frameCount: number;
}

/**
 * The subset of a 4-byte MPEG audio frame header needed to compute frame length.
 * Extend this as your parser grows (channel mode, protection bit, etc.).
 */
export interface FrameHeader {
  /** Bitrate in kbps, decoded from the bitrate index (header bits 15-12). */
  bitrateKbps: number;
  /** Sampling rate in Hz, decoded from the sample-rate index (header bits 11-10). */
  sampleRateHz: number;
  /** Padding bit (header bit 9): 1 adds a single extra byte to this frame. */
  padding: 0 | 1;
}

/** Samples per frame for MPEG-1 Layer III - the constant behind the "144" in the length formula. */
export const MPEG1_LAYER3_SAMPLES_PER_FRAME = 1152;

/**
 * MPEG-1 Layer III bitrate table. Index = header bits 15-12 -> kbps.
 * Index 0b0000 ("free") and 0b1111 ("bad") are invalid here (null).
 *
 * TODO(candidate): transcribe the values from the MPEG-1 frame-header spec.
 *   [null, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, null]
 */
export const MPEG1_LAYER3_BITRATES_KBPS: readonly (number | null)[] = [];

/**
 * MPEG-1 sample-rate table. Index = header bits 11-10 -> Hz.
 * Index 0b11 is reserved (null).
 *
 * TODO(candidate): transcribe the values from the spec.
 *   [44100, 48000, 32000, null]
 */
export const MPEG1_SAMPLE_RATES_HZ: readonly (number | null)[] = [];
