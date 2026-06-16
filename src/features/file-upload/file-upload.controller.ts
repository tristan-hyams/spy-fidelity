import type { FastifyPluginAsync } from 'fastify';
import { enforceMaxBytes, isByteStream } from '../../shared/byte-stream.ts';
import { InvalidMp3Error } from '../../shared/errors.ts';
import type { FrameCountResult } from './mp3.models.ts';
import type { Mp3AnalysisService } from './mp3-analysis.service.ts';

/** Reject uploads larger than this to bound memory and mitigate abuse. */
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB

/**
 * Presentation layer: the `POST /file-upload` route. It owns HTTP concerns only
 * - validate the request shape, hand the byte stream to the service, shape the
 * JSON response - and contains no parsing logic. The service is injected (Pure
 * DI), so this plugin is trivially testable with a fake service.
 */
export const createFileUploadController =
  (analysisService: Mp3AnalysisService): FastifyPluginAsync =>
  async (app) => {
    app.post('/file-upload', async (request, reply): Promise<FrameCountResult> => {
      // The raw-binary content-type parser (see app.ts) sets `body` to the request's
      // byte stream. Guard the shape so an empty or headerless request fails as a clean
      // 400 instead of throwing deep in the stream and surfacing as a 500.
      const body = request.body;
      if (!isByteStream(body)) {
        throw new InvalidMp3Error('Request body must be a binary MP3 stream.');
      }

      // NOTE: enforceMaxBytes is the only size guard - Fastify's bodyLimit is bypassed on
      // the streaming path. With more time: add a Content-Length fast-fail and destroy the
      // request stream on early termination.
      const result = await analysisService.countFrames(enforceMaxBytes(body, MAX_UPLOAD_BYTES));
      reply.code(200).type('application/json');
      return result;
    });
  };
