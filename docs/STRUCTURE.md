# STRUCTURE - spy-fidelity

Coding rules and conventions live in **[RULES.md](RULES.md)**.

> Status: complete. The full pipeline - HTTP layer, DI wiring, error handling, the MPEG-1 Layer III
> frame parser, tooling, and tests - is implemented and green, and verified end-to-end against the
> provided `samples/sample_001.mp3` (6090 frames).

## Overview

spy-fidelity is a small TypeScript / Fastify HTTP API. It exposes a single endpoint that accepts
an MP3 upload and returns the number of MPEG-1 Audio Layer III audio frames, found by a
hand-written streaming parser (no third-party MP3 parser).

## API contract

- **`POST /file-upload`**
  - **Request body:** raw MP3 bytes, streamed (`audio/mpeg` or `application/octet-stream`).
  - **Response:** `200` · `{ "frameCount": <number> }` · `content-type: application/json`.
  - **Errors:** `400` invalid/empty body · `413` too large · `415` bad content type · `500` unexpected.

## Layout (hybrid: vertical slices + separate shared)

```
src/
  server.ts                       # composition root: build deps, wire graph, listen
  app.ts                          # buildApp(deps) -> Fastify instance (parsers, error handler)
  features/
    file-upload/                  # vertical slice (owns its layers)
      file-upload.controller.ts   # presentation: route, request guard, JSON response
      mp3-analysis.service.ts     # application: orchestrates the count (interface + factory)
      mp3-frame-parser.ts         # domain: streaming frame parser + header decode
      mp3.models.ts               # types/DTOs + MPEG-1 format constants (FRAME_HEADER, ID3V2) + tables
      *.test.ts                   # colocated unit + app.inject() tests
  shared/                         # leaf-only cross-cutting helpers (no feature imports)
    byte-reader.ts                # pure: rolling-buffer reader over a byte stream (peek/discard)
    byte-stream.ts                # pure: size guard (enforceMaxBytes) + isByteStream guard
    errors.ts                     # domain errors (AppError -> HTTP status)
docs/                             # RULES.md, STRUCTURE.md
samples/                          # test fixture: sample_001.mp3 (provided, ~1.4 MB VBR)
Dockerfile / .dockerignore        # production image (multi-stage; runs .ts via type-stripping)
spy-fidelity.code-workspace       # VS Code workspace + F5 debug configurations
README.md                         # quick start, npm scripts, Docker, debugging
```

## Dependency direction (down only, no cycles)

```
server.ts  (composition root - constructs the concrete graph)
  -> app.ts  (buildApp)
       -> features/file-upload/file-upload.controller.ts   (presentation)
            -> mp3-analysis.service.ts   (depends on the Mp3FrameParser interface)
                 -> mp3-frame-parser.ts  (domain core)
                      -> shared/*        (byte-reader, byte-stream, errors)
```

- `shared/` is a **leaf**: depended on by features, depends on nothing in the app.
- Features never import other features; reuse flows through `shared/`.
- The only module that knows concrete implementations is `server.ts`.

## Frame counting

`mp3-frame-parser.ts` walks the stream through the shared `ByteReader`:

1. Skip a leading ID3v2 tag (`"ID3"`, syncsafe size, optional footer).
2. `peek` 4 bytes; validate the header (sync + MPEG-1 + Layer III) and decode bitrate / sample-rate
   / padding via the named `FRAME_HEADER` masks in `mp3.models.ts`.
3. Count the frame and `discard` its computed length
   (`floor(1152 / 8 * bitrate / sampleRate) + padding`); on an invalid header, `discard(1)` to re-sync.
4. Repeat to end-of-stream; if no valid frames are found, raise `InvalidMp3Error` (400).

It counts **every physical frame**, including a VBR file's leading Xing/Info metadata frame. For
`sample_001.mp3` that is **6090** MP3 frames = 6089 audio frames + the Xing/Info frame, cross-checked
against the file's own Xing header (which declares 6089, excluding itself).

## Integration points (need -> where)

| Need | Location |
|------|----------|
| Add / modify an endpoint | new slice under `src/features/<feature>/`, registered in `app.ts` |
| Change frame-counting logic | `features/file-upload/mp3-frame-parser.ts` |
| HTTP <-> domain orchestration, error mapping | `features/file-upload/*.controller.ts` / `*.service.ts` |
| Wire dependencies / lifetimes | `src/server.ts` (composition root) |
| Shared pure helpers | `src/shared/` |
| Test fixtures | `samples/` |

## Current state

- **Present:** `package.json`, `tsconfig.json`, `biome.json`, `.gitignore`, `Dockerfile`,
  `.dockerignore`, `README.md`, `spy-fidelity.code-workspace`, `node_modules`, and the full
  `src/` implementation (HTTP layer, DI wiring, error handling, and the MPEG-1 Layer III parser)
  with passing tests. Git initialised on `main` with remote `origin`.
- **Verified:** the end-to-end test counts `samples/sample_001.mp3` (6090 frames), cross-checked
  against the file's own Xing header (which declares 6089, excluding its info frame).
