import type { FrameCountResult } from './mp3.models.ts';
import type { Mp3FrameParser } from './mp3-frame-parser.ts';

/**
 * Application layer: orchestrates the MP3 analysis use case. Today it is a thin
 * adapter over the parser, but it's the seam where future concerns (caching,
 * extracting duration/bitrate, persistence) would live without touching the
 * HTTP layer or the parser.
 */
export interface Mp3AnalysisService {
  countFrames(source: AsyncIterable<Uint8Array>): Promise<FrameCountResult>;
}

export const createMp3AnalysisService = (parser: Mp3FrameParser): Mp3AnalysisService => ({
  async countFrames(source): Promise<FrameCountResult> {
    const frameCount = await parser.count(source);
    return { frameCount };
  },
});
