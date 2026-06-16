import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../../app.ts';
import { createMp3AnalysisService } from './mp3-analysis.service.ts';
import { createMp3FrameParser } from './mp3-frame-parser.ts';

/** Build the real app graph with the logger silenced for tests. */
const buildTestApp = () =>
  buildApp(
    { mp3AnalysisService: createMp3AnalysisService(createMp3FrameParser()) },
    { logger: false },
  );

/** A single valid MPEG-1 Layer III frame: 128 kbps / 44.1 kHz, no padding (417 bytes). */
const buildFrame = (): Uint8Array => {
  const frame = new Uint8Array(417);
  frame.set([0xff, 0xfb, 0x90, 0x00], 0);
  return frame;
};

test('POST /file-upload rejects unsupported content types with 415', async () => {
  const app = buildTestApp();
  const response = await app.inject({
    method: 'POST',
    url: '/file-upload',
    headers: { 'content-type': 'text/plain' },
    payload: 'definitely not an mp3',
  });
  assert.equal(response.statusCode, 415);
});

test('POST /file-upload rejects an empty/headerless body with 400', async () => {
  const app = buildTestApp();
  const response = await app.inject({ method: 'POST', url: '/file-upload' });
  assert.equal(response.statusCode, 400);
});

test('POST /file-upload returns the frame count for a synthetic MP3 body', async () => {
  const app = buildTestApp();
  const body = Buffer.concat([buildFrame(), buildFrame(), buildFrame()]);
  const response = await app.inject({
    method: 'POST',
    url: '/file-upload',
    headers: { 'content-type': 'audio/mpeg' },
    payload: body,
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { frameCount: 3 });
});

// End-to-end against the real 1.4 MB VBR fixture. The expected 6090 was cross-checked against
// the file's own Xing header, which declares 6089 frames (excluding its own info frame): 6089 + 1.
test('POST /file-upload returns the frame count for the provided sample file', async () => {
  const { readFile } = await import('node:fs/promises');
  const bytes = await readFile(new URL('../../../samples/sample_001.mp3', import.meta.url));
  const app = buildTestApp();
  const response = await app.inject({
    method: 'POST',
    url: '/file-upload',
    headers: { 'content-type': 'audio/mpeg' },
    payload: bytes,
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { frameCount: 6090 });
});
