import type { IncomingMessage } from 'node:http';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { createFileUploadController } from './features/file-upload/file-upload.controller.ts';
import type { Mp3AnalysisService } from './features/file-upload/mp3-analysis.service.ts';
import { AppError } from './shared/errors.ts';

/** Everything the HTTP app needs, injected from the composition root. */
export interface AppDependencies {
  mp3AnalysisService: Mp3AnalysisService;
}

export interface BuildAppOptions {
  /** Enable the Fastify (pino) logger. Default true; tests pass false to stay quiet. */
  logger?: boolean;
}

/**
 * Assembles the Fastify instance from injected dependencies. Kept separate from
 * `listen()` so tests can drive it via `app.inject()` with no real sockets.
 */
export const buildApp = (deps: AppDependencies, options: BuildAppOptions = {}): FastifyInstance => {
  const app = Fastify({ logger: options.logger ?? true });

  // Stream the raw request body straight to the handler instead of buffering it.
  // Removing the default parsers means any other content type returns 415.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser(
    ['audio/mpeg', 'application/octet-stream'],
    (
      _request: FastifyRequest,
      payload: IncomingMessage,
      done: (err: Error | null, body?: unknown) => void,
    ): void => {
      done(null, payload);
    },
  );

  // Translate domain errors to their HTTP status; preserve Fastify's own status
  // codes (e.g. 415 for unsupported media type); mask unexpected 5xx details.
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({ error: error.name, message: error.message });
    }
    // Fastify/validation errors (e.g. 415 unsupported media type) carry their own
    // numeric statusCode; honour it and mask details for unexpected 5xx failures.
    const err = error as { statusCode?: number; name?: string; message?: string };
    const statusCode =
      typeof err.statusCode === 'number' && err.statusCode >= 400 ? err.statusCode : 500;
    if (statusCode >= 500) {
      request.log.error(error);
    }
    return reply.code(statusCode).send({
      error: err.name ?? 'Error',
      message: statusCode >= 500 ? 'Unexpected error.' : (err.message ?? 'Request error.'),
    });
  });

  app.register(createFileUploadController(deps.mp3AnalysisService));
  return app;
};
