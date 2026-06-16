/**
 * A pull-based reader over an async byte stream. It buffers only what is needed
 * to satisfy the next `peek` (a few bytes), and `discard` drops skipped data
 * without buffering it - so memory stays flat no matter how large the stream is.
 *
 * Generic and MP3-agnostic: it lives in `shared/` (leaf code).
 */
export interface ByteReader {
  /**
   * Ensure at least `n` bytes are buffered and return a read-only view of the
   * next `n` without consuming them. Returns null if the stream ends first.
   */
  peek(n: number): Promise<Uint8Array | null>;
  /**
   * Consume up to `n` bytes, pulling and dropping chunks as needed without
   * buffering skipped data. Returns the number actually discarded (< n at EOF).
   */
  discard(n: number): Promise<number>;
}

export const createByteReader = (source: AsyncIterable<Uint8Array>): ByteReader => {
  const iterator = source[Symbol.asyncIterator]();
  // ArrayBufferLike (not ArrayBuffer): incoming stream chunks may be backed by either.
  let buffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  let offset = 0; // bytes already consumed from the front of `buffer`
  let ended = false;

  const available = (): number => buffer.length - offset;

  const pull = async (): Promise<Uint8Array | null> => {
    if (ended) {
      return null;
    }
    const next = await iterator.next();
    if (next.done) {
      ended = true;
      return null;
    }
    return next.value;
  };

  return {
    async peek(n: number): Promise<Uint8Array | null> {
      while (available() < n) {
        const chunk = await pull();
        if (chunk === null) {
          return null;
        }
        // Drop the already-consumed prefix, then append the new chunk.
        const head = offset > 0 ? buffer.subarray(offset) : buffer;
        const merged = new Uint8Array(head.length + chunk.length);
        merged.set(head, 0);
        merged.set(chunk, head.length);
        buffer = merged;
        offset = 0;
      }
      return buffer.subarray(offset, offset + n);
    },

    async discard(n: number): Promise<number> {
      const fromBuffer = Math.min(n, available());
      offset += fromBuffer;
      let remaining = n - fromBuffer;
      while (remaining > 0) {
        const chunk = await pull();
        if (chunk === null) {
          break;
        }
        if (chunk.length <= remaining) {
          remaining -= chunk.length; // drop the whole chunk
        } else {
          buffer = chunk; // keep the tail of this chunk as the new buffer
          offset = remaining;
          remaining = 0;
        }
      }
      return n - remaining;
    },
  };
};
