import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMp3FrameParser, frameLength, parseMp3FrameHeader } from './mp3-frame-parser.ts';

const BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const SAMPLE_RATES = [44100, 48000, 32000];

/** Build a self-consistent MPEG-1 Layer III frame: valid header + zero-filled payload. */
function buildFrame(bitrateKbps = 128, sampleRateHz = 44100, padding: 0 | 1 = 0): Uint8Array {
  const bitrateIndex = BITRATES.indexOf(bitrateKbps);
  const sampleRateIndex = SAMPLE_RATES.indexOf(sampleRateHz);
  const length = Math.floor((1152 * bitrateKbps * 1000) / (8 * sampleRateHz)) + padding;
  const frame = new Uint8Array(length);
  frame[0] = 0xff;
  frame[1] = 0xfb; // sync + MPEG-1 + Layer III + no CRC
  frame[2] = (bitrateIndex << 4) | (sampleRateIndex << 2) | (padding << 1);
  frame[3] = 0x00;
  return frame;
}

const ID3V2_HEADER = 10;

/** A minimal ID3v2 tag (10-byte header + zeroed body) with a syncsafe size. */
function id3v2Tag(bodySize: number): Uint8Array {
  const tag = new Uint8Array(ID3V2_HEADER + bodySize);
  tag.set([0x49, 0x44, 0x33, 0x03, 0x00, 0x00], 0); // "ID3", v2.3, no flags
  tag[6] = (bodySize >> 21) & 0x7f;
  tag[7] = (bodySize >> 14) & 0x7f;
  tag[8] = (bodySize >> 7) & 0x7f;
  tag[9] = bodySize & 0x7f;
  return tag;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function* once(data: Uint8Array): AsyncIterable<Uint8Array> {
  yield data;
}

async function* chunked(data: Uint8Array, size: number): AsyncIterable<Uint8Array> {
  for (let offset = 0; offset < data.length; offset += size) {
    yield data.subarray(offset, offset + size);
  }
}

const parser = createMp3FrameParser();

test('parseMp3FrameHeader decodes a valid MPEG-1 Layer III header', () => {
  assert.deepEqual(parseMp3FrameHeader(buildFrame(128, 44100, 0).subarray(0, 4)), {
    bitrateKbps: 128,
    sampleRateHz: 44100,
    padding: 0,
  });
});

test('parseMp3FrameHeader rejects bad sync, wrong layer, free bitrate, and short input', () => {
  assert.equal(parseMp3FrameHeader(new Uint8Array([0x00, 0xfb, 0x90, 0x00])), null); // no sync
  assert.equal(parseMp3FrameHeader(new Uint8Array([0xff, 0xfd, 0x90, 0x00])), null); // Layer II
  assert.equal(parseMp3FrameHeader(new Uint8Array([0xff, 0xfb, 0x00, 0x00])), null); // free bitrate
  assert.equal(parseMp3FrameHeader(new Uint8Array([0xff, 0xfb, 0x90])), null); // too short
});

test('frameLength matches the known 417 bytes for 128 kbps / 44.1 kHz', () => {
  assert.equal(frameLength({ bitrateKbps: 128, sampleRateHz: 44100, padding: 0 }), 417);
  assert.equal(frameLength({ bitrateKbps: 128, sampleRateHz: 44100, padding: 1 }), 418);
});

test('count returns the number of frames in a clean stream', async () => {
  assert.equal(await parser.count(once(concat(buildFrame(), buildFrame(), buildFrame()))), 3);
});

test('count skips a leading ID3v2 tag', async () => {
  assert.equal(await parser.count(once(concat(id3v2Tag(64), buildFrame(), buildFrame()))), 2);
});

test('count re-syncs past leading non-frame bytes', async () => {
  const mp3 = concat(new Uint8Array([0x00, 0x00, 0x00]), buildFrame(), buildFrame());
  assert.equal(await parser.count(once(mp3)), 2);
});

test('count handles variable-bitrate frames', async () => {
  const mp3 = concat(buildFrame(128), buildFrame(192), buildFrame(256));
  assert.equal(await parser.count(once(mp3)), 3);
});

test('count is correct when frames are split across tiny chunks', async () => {
  const mp3 = concat(buildFrame(), buildFrame(), buildFrame(), buildFrame());
  assert.equal(await parser.count(chunked(mp3, 7)), 4);
});

test('count throws InvalidMp3Error when no frames are present', async () => {
  await assert.rejects(() => parser.count(once(new Uint8Array([0x00, 0x01, 0x02]))), {
    name: 'InvalidMp3Error',
  });
  await assert.rejects(() => parser.count(once(new Uint8Array(0))), { name: 'InvalidMp3Error' });
});

test('count includes a final frame whose body is truncated at end-of-stream', async () => {
  const full = concat(buildFrame(), buildFrame()); // two complete frames
  const truncated = buildFrame().subarray(0, 100); // valid header, body cut short
  assert.equal(await parser.count(once(concat(full, truncated))), 3);
});

test('count skips an ID3v2 tag that declares a footer', async () => {
  const tag = id3v2Tag(32);
  tag[5] = 0b0001_0000; // set the footer flag -> 10 extra trailing bytes
  const footer = new Uint8Array(10);
  const mp3 = concat(tag, footer, buildFrame(), buildFrame());
  assert.equal(await parser.count(once(mp3)), 2);
});
