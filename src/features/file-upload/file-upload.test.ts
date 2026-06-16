import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../../app.ts';
import { createMp3AnalysisService } from './mp3-analysis.service.ts';
import { createMp3FrameParser } from './mp3-frame-parser.ts';

/** Build the real app graph with the logger silenced for tests. */
const buildTestApp = () =>
  buildApp(
    { analysisService: createMp3AnalysisService(createMp3FrameParser()) },
    { logger: false },
  );

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

// TODO(candidate): after implementing the parser, add `samples/sample.mp3` to the
// repo and remove `skip` to assert the real frame count end-to-end.
test('POST /file-upload returns the frame count for the sample file', {
  skip: 'implement the parser, then add samples/sample.mp3 and the expected count',
}, async () => {
  const { readFile } = await import('node:fs/promises');
  const bytes = await readFile(new URL('../../../samples/sample.mp3', import.meta.url));
  const app = buildTestApp();
  const response = await app.inject({
    method: 'POST',
    url: '/file-upload',
    headers: { 'content-type': 'audio/mpeg' },
    payload: bytes,
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { frameCount: 0 /* TODO: expected count */ });
});
