import assert from 'node:assert/strict';
import { test } from 'node:test';
import { enforceMaxBytes, isByteStream } from './byte-stream.ts';

async function* streamOf(...chunks: Uint8Array[]): AsyncIterable<Uint8Array> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

async function totalBytes(source: AsyncIterable<Uint8Array>): Promise<number> {
  let total = 0;
  for await (const chunk of source) {
    total += chunk.byteLength;
  }
  return total;
}

test('isByteStream accepts async byte streams and rejects everything else', () => {
  assert.equal(isByteStream(streamOf(new Uint8Array([1]))), true);
  assert.equal(isByteStream(undefined), false);
  assert.equal(isByteStream(null), false);
  assert.equal(isByteStream('a string'), false); // sync-iterable, not async
  assert.equal(isByteStream({}), false);
});

test('enforceMaxBytes passes data through when under the limit', async () => {
  const passed = await totalBytes(
    enforceMaxBytes(streamOf(new Uint8Array(10), new Uint8Array(20)), 100),
  );
  assert.equal(passed, 30);
});

test('enforceMaxBytes throws once the cumulative size exceeds the limit', async () => {
  await assert.rejects(
    () => totalBytes(enforceMaxBytes(streamOf(new Uint8Array(60), new Uint8Array(60)), 100)),
    /exceeds the maximum allowed size/,
  );
});
