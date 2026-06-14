# STRUCTURE — mp3-spy

Coding rules and conventions live in **[RULES.md](RULES.md)**.

> Status: project bootstrap. Tooling/config exist; the `src/` source below is being
> scaffolded to this agreed layout. Update this document as code lands.

## Overview

mp3-spy is a small TypeScript / Fastify HTTP API. It exposes a single endpoint that accepts
an MP3 upload and returns the number of MPEG‑1 Audio Layer III audio frames, found by a
hand-written streaming parser (no third-party MP3 parser).

## API contract

- **`POST /file-upload`**
  - **Request body:** raw MP3 bytes, streamed (`audio/mpeg` or `application/octet-stream`).
  - **Response:** `200` · `{ "frameCount": <number> }` · `content-type: application/json`.
  - **Errors:** `400` invalid MP3 · `413` too large · `415` bad content type · `500` unexpected.

## Layout (hybrid: vertical slices + separate shared)

```
src/
  server.ts                       # composition root: build deps, wire graph, listen
  app.ts                          # buildApp(deps) -> configured Fastify instance
  features/
    file-upload/                  # vertical slice (owns its layers)
      file-upload.controller.ts   # presentation: Fastify route plugin, error mapping
      mp3-analysis.service.ts     # application: orchestrates the count (interface + factory)
      mp3-frame-parser.ts         # domain: streaming frame parser (interface + factory)
      mp3.models.ts               # types/DTOs: FrameCountResult, header fields, tables
      *.test.ts                   # colocated unit + app.inject() integration tests
  shared/                         # leaf-only cross-cutting helpers (no feature imports)
    bit-reader.ts                 # pure: extract header fields from bytes
    byte-stream.ts                # pure: chunk / rolling-buffer helpers
    errors.ts                     # domain error types
docs/                             # RULES.md, STRUCTURE.md
samples/                          # test fixture(s): sample.mp3 (provided by the assignment)
```

## Dependency direction (down only, no cycles)

```
server.ts  (composition root — constructs the concrete graph)
  └─ app.ts  (buildApp)
       └─ features/file-upload/file-upload.controller.ts   (presentation)
            └─ mp3-analysis.service.ts        depends on -> Mp3FrameParser (interface)
                 └─ mp3-frame-parser.ts       (domain core)
                      └─ shared/*             (bit-reader, byte-stream, errors)
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

- **Present:** `package.json`, `package-lock.json`, `tsconfig.json`, `biome.json`, `.gitignore`, installed `node_modules`.
- **Pending:** `src/` source, `samples/sample.mp3`, tests. Not yet a git repository.
