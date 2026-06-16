import { buildApp } from './app.ts';
import { createMp3AnalysisService } from './features/file-upload/mp3-analysis.service.ts';
import { createMp3FrameParser } from './features/file-upload/mp3-frame-parser.ts';

// TCP port to listen on; overridable via the PORT env var (default 3000).
const PORT = Number(process.env.PORT ?? 3000);

// Composition root: the one and only place that constructs the concrete graph.
// Dependencies point down - server -> service -> parser -> shared.
// Domain core: the hand-written MP3 frame parser.
const mp3FrameParser = createMp3FrameParser();
// Application service that orchestrates the frame count.
const mp3AnalysisService = createMp3AnalysisService(mp3FrameParser);
// The configured Fastify instance, ready to listen.
const app = buildApp({ mp3AnalysisService: mp3AnalysisService });

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

// Graceful shutdown: drain in-flight requests and flush logs on container stop
// (`docker stop` / Ctrl-C). Pair with `docker run --init` for signal forwarding.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    app.close().then(
      () => process.exit(0),
      (error) => {
        app.log.error(error);
        process.exit(1);
      },
    );
  });
}
