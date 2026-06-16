/**
 * Domain core: counts MPEG-1 Audio Layer III frames in a byte stream.
 *
 * This is the heart of the exercise and the part you write. The HTTP layer,
 * DI wiring, error handling, and streaming plumbing are already in place - your
 * job is the parsing logic below. Keep it streaming (do not buffer the whole
 * file) so memory stays flat regardless of file size.
 */

/** Counts the audio frames in an MP3 byte stream. */
export interface Mp3FrameParser {
  /**
   * Count MPEG-1 Audio Layer III frames in a stream of byte chunks.
   * Consumes the stream lazily - must not buffer the whole input.
   */
  count(source: AsyncIterable<Uint8Array>): Promise<number>;
}

export const createMp3FrameParser = (): Mp3FrameParser => ({
  async count(_source: AsyncIterable<Uint8Array>): Promise<number> {
    // ====================================================================
    // TODO(candidate): implement streaming MPEG-1 Layer III frame counting.
    // Rename `_source` -> `source` once you start consuming it.
    //
    // Suggested approach (streaming, O(1) memory):
    //   1. Maintain a small rolling buffer of not-yet-consumed bytes; append
    //      each incoming chunk (`for await (const chunk of source)`).
    //   2. Once, at the start: if the buffer begins with the ASCII "ID3",
    //      skip the ID3v2 tag. Its size is a 4-byte *syncsafe* integer
    //      (7 bits per byte) at offset 6; the tag is 10 + size bytes
    //      (plus 10 more if the footer flag in the flags byte is set).
    //   3. Loop while at least 4 header bytes are buffered:
    //        a. Read the 32-bit header: (b0<<24)|(b1<<16)|(b2<<8)|b3.
    //        b. Validate: frame sync = top 11 bits all 1; version bits = 0b11
    //           (MPEG-1); layer bits = 0b01 (Layer III). If invalid, either
    //           resync (advance one byte) or, if nothing valid is ever found,
    //           throw InvalidMp3Error (from src/shared/errors.ts). An empty body
    //           or all-invalid input should surface here as a deterministic 400.
    //        c. Decode bitrate (bits 15-12) and sample rate (bits 11-10) via
    //           the tables in ./mp3.models.ts; read the padding bit (bit 9).
    //        d. frameLength = floor(144 * bitrateBps / sampleRateHz) + padding
    //           where 144 = MPEG1_LAYER3_SAMPLES_PER_FRAME / 8.
    //        e. If the full frame isn't buffered yet, read more chunks first.
    //           Otherwise increment the count and advance by frameLength.
    //   4. When the stream ends, return the count.
    //
    // Reusable, MP3-agnostic helpers (bit reading, rolling buffer) belong in
    // src/shared/. The reference tables/constants live in ./mp3.models.ts.
    // ====================================================================
    throw new Error('Mp3FrameParser.count is not implemented yet - see the TODO above.');
  },
});
