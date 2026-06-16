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

/**
 * Layout of the 4-byte MPEG-1 Layer III frame header. The header is big-endian:
 *   byte 0 = bits 31-24, byte 1 = bits 23-16, byte 2 = bits 15-8, byte 3 = bits 7-0.
 * Each field below names its shift/mask so the parser reads declaratively.
 */
export const FRAME_HEADER = {
  // Length of a frame header in bytes.
  BYTES: 4,
  // Byte 0 of the 11-bit frame sync: every bit set.
  SYNC_BYTE_0: 0xff,
  // Byte 1's top three bits complete the frame sync.
  SYNC_BYTE_1_MASK: 0b1110_0000,
  // Right-shift to reach the version field (byte 1, bits 20-19).
  VERSION_SHIFT: 3,
  // Two-bit mask for the version field after shifting.
  VERSION_MASK: 0b11,
  // Version value that identifies MPEG Version 1.
  VERSION_MPEG_1: 0b11,
  // Right-shift to reach the layer field (byte 1, bits 18-17).
  LAYER_SHIFT: 1,
  // Two-bit mask for the layer field after shifting.
  LAYER_MASK: 0b11,
  // Layer value that identifies Layer III.
  LAYER_III: 0b01,
  // Right-shift to reach the bitrate index (byte 2, bits 15-12).
  BITRATE_INDEX_SHIFT: 4,
  // Four-bit mask for the bitrate index after shifting.
  BITRATE_INDEX_MASK: 0b1111,
  // Right-shift to reach the sample-rate index (byte 2, bits 11-10).
  SAMPLE_RATE_INDEX_SHIFT: 2,
  // Two-bit mask for the sample-rate index after shifting.
  SAMPLE_RATE_INDEX_MASK: 0b11,
  // Right-shift to reach the padding bit (byte 2, bit 9).
  PADDING_SHIFT: 1,
  // One-bit mask for the padding bit after shifting.
  PADDING_MASK: 0b1,
} as const;

/** Structure of the optional ID3v2 metadata tag that can precede the audio frames. */
export const ID3V2 = {
  // ASCII "ID3" - the three magic bytes that open an ID3v2 tag.
  MAGIC: [0x49, 0x44, 0x33],
  // Length of the header (and of its optional footer) in bytes.
  HEADER_BYTES: 10,
  // Offset of the flags byte within the header.
  FLAGS_OFFSET: 5,
  // Flag bit (in the flags byte) signalling a trailing 10-byte footer.
  FOOTER_FLAG: 0b0001_0000,
  // Offset of the 4-byte syncsafe size field within the header.
  SIZE_OFFSET: 6,
  // Number of bytes in the syncsafe size field.
  SIZE_BYTES: 4,
  // Usable bits per syncsafe byte (the high bit is always 0).
  SYNCSAFE_BYTE_MASK: 0x7f,
  // Bit count to shift in per syncsafe byte when reassembling the size.
  SYNCSAFE_BITS_PER_BYTE: 7,
} as const;

// Samples per MPEG-1 Layer III frame; divided by 8 this is the well-known "144".
export const MPEG1_LAYER3_SAMPLES_PER_FRAME = 1152;
// Bits in a byte - turns the bits-per-second maths into bytes.
export const BITS_PER_BYTE = 8;
// Bits per kilobit - converts the kbps bitrate table into bits per second.
export const BITS_PER_KILOBIT = 1000;

/**
 * MPEG-1 Layer III bitrate table. Index = header bits 15-12 -> kbps.
 * Index 0b0000 ("free") and 0b1111 ("bad") are invalid for our purposes (null).
 */
export const MPEG1_LAYER3_BITRATES_KBPS: readonly (number | null)[] = [
  null,
  32,
  40,
  48,
  56,
  64,
  80,
  96,
  112,
  128,
  160,
  192,
  224,
  256,
  320,
  null,
];

/**
 * MPEG-1 sample-rate table. Index = header bits 11-10 -> Hz.
 * Index 0b11 is reserved (null).
 */
export const MPEG1_SAMPLE_RATES_HZ: readonly (number | null)[] = [44100, 48000, 32000, null];
