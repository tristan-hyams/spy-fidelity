# STRUCTURE - spy-fidelity

Coding rules and conventions live in **[RULES.md](RULES.md)**.

> Status: scaffolded. The HTTP layer, DI wiring, error handling, tooling, and tests below
> are implemented and green. The MPEG‑1 Layer III parser (`mp3-frame-parser.ts`) is the
> remaining TODO, and `samples/sample.mp3` still needs to be added for the end-to-end test.

## Overview

spy-fidelity is a small TypeScript / Fastify HTTP API. It exposes a single endpoint that accepts
an MP3 upload and returns the number of MPEG‑1 Audio Layer III audio frames, found by a
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
      mp3-frame-parser.ts         # domain: streaming frame parser (interface + factory) [TODO]
      mp3.models.ts               # types/DTOs + MPEG-1 reference tables
      file-upload.test.ts         # colocated app.inject() tests
  shared/                         # leaf-only cross-cutting helpers (no feature imports)
    byte-stream.ts                # pure: streaming size-guard (enforceMaxBytes)
    errors.ts                     # domain errors (AppError -> HTTP status)
docs/                             # RULES.md, STRUCTURE.md
samples/                          # test fixture(s): sample.mp3 (provided by the assignment) [pending]
Dockerfile / .dockerignore        # production image (multi-stage; runs .ts via type-stripping)
spy-fidelity.code-workspace       # VS Code workspace + F5 debug configurations
README.md                         # quick start, npm scripts, Docker, debugging
```

> When you implement the parser, add `shared/bit-reader.ts` (and any rolling-buffer helper)
> under `shared/` - keep them pure and MP3-agnostic where possible.

## Dependency direction (down only, no cycles)

```
server.ts  (composition root - constructs the concrete graph)
  └─ app.ts  (buildApp)
       └─ features/file-upload/file-upload.controller.ts   (presentation)
            └─ mp3-analysis.service.ts        depends on -> Mp3FrameParser (interface)
                 └─ mp3-frame-parser.ts       (domain core)
                      └─ shared/*             (byte-stream, errors)
```

- `shared/` is a **leaf**: depended on by features, depends on nothing in the app.
- Features never import other features; reuse flows through `shared/`.
- The only module that knows concrete implementations is `server.ts`.

## Integration points (need → where)

| Need | Location |
|------|----------|
| Add / modify an endpoint | new slice under `src/features/<feature>/`, registered in `app.ts` |
| Change frame-counting logic | `features/file-upload/mp3-frame-parser.ts` |
| HTTP ↔ domain orchestration, error mapping | `features/file-upload/*.controller.ts` / `*.service.ts` |
| Wire dependencies / lifetimes | `src/server.ts` (composition root) |
| Shared pure helpers | `src/shared/` |
| Test fixtures | `samples/` |

## Current state

- **Present:** `package.json`, `tsconfig.json`, `biome.json`, `.gitignore`, `Dockerfile`,
  `.dockerignore`, `README.md`, `spy-fidelity.code-workspace`, `node_modules`, and the full
  `src/` scaffold (HTTP layer, DI wiring, error handling) with a passing
  `src/features/file-upload/file-upload.test.ts`. Git initialised on `main` with remote `origin`.
- **Remaining:** implement `mp3-frame-parser.ts` (and fill the reference tables in `mp3.models.ts`),
  add `samples/sample.mp3`, then un-skip the end-to-end test.
