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

/** Build a streaming byte reader over an async iterable of chunks. */
export const createByteReader = (source: AsyncIterable<Uint8Array>): ByteReader => {
  // Underlying chunk iterator we pull from on demand.
  const iterator = source[Symbol.asyncIterator]();
  // Unconsumed bytes held back for reads (ArrayBufferLike: chunks may be backed by either).
  let buffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  // How many bytes at the front of `buffer` have already been consumed.
  let offset = 0;
  // Whether the source has reported end-of-stream.
  let ended = false;

  // Bytes currently readable without pulling more from the source.
  const available = (): number => buffer.length - offset;

  // Pull the next chunk from the source, or null once the stream ends.
  const pull = async (): Promise<Uint8Array | null> => {
    if (ended) {
      return null;
    }
    // Iterator result holding the next chunk (or done).
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
        // Next chunk, or null if the stream ended before n bytes were available.
        const chunk = await pull();
        if (chunk === null) {
          return null;
        }
        // The still-unconsumed prefix of the current buffer.
        const head = offset > 0 ? buffer.subarray(offset) : buffer;
        // A fresh buffer holding that prefix followed by the new chunk.
        const merged = new Uint8Array(head.length + chunk.length);
        merged.set(head, 0);
        merged.set(chunk, head.length);
        buffer = merged;
        offset = 0;
      }
      return buffer.subarray(offset, offset + n);
    },

    async discard(n: number): Promise<number> {
      // Bytes we can drop straight from the current buffer.
      const fromBuffer = Math.min(n, available());
      offset += fromBuffer;
      // Bytes still to drop by pulling (and discarding) further chunks.
      let remaining = n - fromBuffer;
      while (remaining > 0) {
        // Next chunk to drop wholly or in part.
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
