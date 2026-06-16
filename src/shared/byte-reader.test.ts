import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createByteReader } from './byte-reader.ts';

async function* chunksOf(...parts: number[][]): AsyncIterable<Uint8Array> {
  for (const part of parts) {
    yield Uint8Array.from(part);
  }
}

test('peek assembles bytes across chunk boundaries without consuming them', async () => {
  const reader = createByteReader(chunksOf([1, 2], [3, 4, 5]));
  assert.deepEqual([...((await reader.peek(4)) ?? [])], [1, 2, 3, 4]);
  // A second peek returns the same bytes - peek does not advance the position.
  assert.deepEqual([...((await reader.peek(4)) ?? [])], [1, 2, 3, 4]);
});

test('peek returns null when the stream ends before n bytes', async () => {
  const reader = createByteReader(chunksOf([1, 2, 3]));
  assert.equal(await reader.peek(4), null);
});

test('discard skips across chunk boundaries and advances the read position', async () => {
  const reader = createByteReader(chunksOf([1, 2, 3], [4, 5, 6], [7, 8]));
  assert.equal(await reader.discard(5), 5);
  assert.deepEqual([...((await reader.peek(3)) ?? [])], [6, 7, 8]);
});

test('discard returns fewer than requested at end of stream', async () => {
  const reader = createByteReader(chunksOf([1, 2, 3]));
  assert.equal(await reader.discard(10), 3);
});
