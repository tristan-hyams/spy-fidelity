import { PayloadTooLargeError } from './errors.ts';

/** Type guard: is `value` an async iterable of byte chunks (e.g. a Node request stream)? */
export const isByteStream = (value: unknown): value is AsyncIterable<Uint8Array> =>
  typeof (value as AsyncIterable<Uint8Array> | null | undefined)?.[Symbol.asyncIterator] ===
  'function';

/**
 * Re-yields a byte stream unchanged while enforcing a cumulative size limit,
 * without buffering the whole input - keeps memory bounded under large or
 * abusive uploads. Place generic, MP3-agnostic stream helpers like this here
 * in `shared/` (leaf code: no imports from `features/`).
 *
 * @throws {PayloadTooLargeError} once more than `maxBytes` have been seen.
 */
export async function* enforceMaxBytes(
  source: AsyncIterable<Uint8Array>,
  maxBytes: number,
): AsyncIterable<Uint8Array> {
  let total = 0;
  for await (const chunk of source) {
    total += chunk.byteLength;
    if (total > maxBytes) {
      throw new PayloadTooLargeError(
        `Upload exceeds the maximum allowed size of ${maxBytes} bytes.`,
      );
    }
    yield chunk;
  }
}
