# RULES - spy-fidelity

Coding rules, conventions, and commands for this project.
Architecture and package layout live in **[STRUCTURE.md](STRUCTURE.md)**.

> Status: complete. The HTTP layer, DI wiring, error handling, the hand-written MPEG-1 Layer III
> frame parser, tooling, and tests are all implemented and green. Keep this in sync as code changes.

## What this is

An HTTP API that counts the audio frames in an MPEG-1 Audio Layer III (MP3) file.
Single endpoint: `POST /file-upload` -> `{ "frameCount": <number> }`.
MP3 frame parsing is **hand-written** (no third-party MP3 library) - see constraints below.

## Design principles & working preferences

- **Concise:** keep responses, comments, and commits short and direct - signal over noise, no filler.
- **KISS:** prefer the simplest thing that works; avoid cleverness and premature abstraction.
- **Single Responsibility:** each module, function, and layer does one thing. A slice owns one
  feature; a helper does one job.
- **DRY:** one source of truth. Shared logic lives in `src/shared/`; format facts (bit masks,
  tables) live once in `mp3.models.ts`.
- **YAGNI:** build only what the task needs. No speculative features - e.g. no DI container and no
  repository layer while the scope stays this small.
- **n-tier, thin vertical slices:** layered discipline (presentation -> application -> domain)
  organised as small, cohesive feature slices under `src/features/<feature>/`, with leaf utilities
  in `src/shared/`. Keep slices thin; push reuse down into `shared/`.
- **No magic values:** name every constant and give it a brief comment; keep magic numbers/bytes
  out of logic.

## Toolchain

- **Runtime:** Node.js >= 24 (developed on 25). Runs `.ts` directly via type-stripping - no build step.
- **Language:** TypeScript, `strict`. ESM (`"type": "module"`).
- **HTTP framework:** Fastify.
- **Format + lint:** Biome (`biome.json`).
- **Type-check:** `tsc --noEmit` (`tsconfig.json`).
- **Tests:** Node's built-in runner (`node:test` + `node:assert`).

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Watch-run the server (port 3000) |
| `npm start` | Run the server |
| `npm test` | Run the test suite |
| `npm run typecheck` | Type-check only (`tsc --noEmit`) |
| `npm run lint` / `format` / `check` | Biome lint / format / both |
| `npm run setup` | One-shot workstation setup: `npm ci` + typecheck + check + test |

Docker: `docker build -t spy-fidelity . && docker run --rm --init -p 3000:3000 spy-fidelity`.
VS Code: open `spy-fidelity.code-workspace` and press F5. Full usage: see [README](../README.md).

## Architecture rules (layered discipline)

- **Dependencies point DOWN only - never up, no cycles:** Presentation (controllers / Fastify
  route plugins) -> Application (services) -> Domain (pure parser).
- **Depend on interfaces, not concretes**, at every seam.
- **Pure DI:** each unit is a `create<Name>(deps): <Interface>` factory (Go-style). The composition
  root (`src/server.ts`) is the only place that constructs the concrete graph. No DI container /
  service locator at this scale (awilix / `@fastify/awilix` is the documented scale-up path).
- A persistence / repository layer is **intentionally absent** (nothing is persisted). If added, it
  sits below services behind an interface.
- `buildApp(deps)` returns a configured Fastify instance; `server.ts` wires deps and listens (with
  graceful SIGINT/SIGTERM shutdown). Tests drive the app via `app.inject()` (no real sockets).

## Project organization ("localization")

- **Thin vertical feature slices:** `src/features/<feature>/` holds that feature's controller,
  service, domain logic, models, and colocated tests.
- **Shared utility code is separate** in `src/shared/` and MUST be **leaf**: pure, dependency-free,
  no imports from `src/features/`.
- Features never import other features; cross-feature reuse goes through `src/shared/`.
- Concrete tree: see STRUCTURE.md.

## Streaming & performance

- The parser consumes an `AsyncIterable<Uint8Array>` (a byte stream), never a fully buffered
  `Buffer` -> O(1) memory regardless of file size.
- `src/shared/byte-reader.ts` is a generic pull-based reader (`peek`/`discard`) that buffers only a
  few bytes and drops skipped data without retaining it.
- Fastify's default body parsing is removed; a raw content-type parser passes the request stream
  straight through (`audio/mpeg` / `application/octet-stream`), preserving streaming.
- The parser reads only the 4 header bytes per frame and skips frame payloads.

## MP3 parsing (implementation)

- **Scope:** MPEG Version 1, Layer III only. Other MPEG formats are out of scope.
- **No npm package parses frame data** (HTTP / utility packages are fine).
- Format constants are named in `mp3.models.ts` (`FRAME_HEADER` masks/shifts, `ID3V2` offsets,
  bitrate/sample-rate tables) - no magic numbers in the parser.
- Frame length (MPEG-1 LIII): `floor(1152 / 8 * bitrate / sampleRate) + padding`.
- A leading ID3v2 tag (`"ID3"`, syncsafe size, optional footer) is skipped before counting.
- On an invalid header the parser advances one byte to re-sync; once aligned, each frame's length
  lands exactly on the next header.
- **Counts every physical frame**, including a VBR file's leading Xing/Info frame. For the sample
  that is 6090 MP3 frames (6089 audio frames + the metadata frame); empty / all-invalid input
  raises `InvalidMp3Error` (400).

## TypeScript conventions

- `strict` + `noUncheckedIndexedAccess`. No `any` - use `unknown` + narrowing.
- Explicit return types on exported functions.
- Interfaces named for their role, **no Hungarian `I` prefix** (`Mp3FrameParser`).
- `import type` for type-only imports (`verbatimModuleSyntax` is on).
- **Name every constant** and give it a one-line comment; no inline magic numbers/bytes.

## Naming

- Files: kebab-case (`mp3-frame-parser.ts`).
- Types / interfaces / classes: PascalCase. Functions / vars: camelCase.
- True constants, lookup tables, and grouped config objects (e.g. `FRAME_HEADER`): UPPER_SNAKE_CASE.
- Factory functions: `create<Name>`.

## Error handling

- Domain errors extend a typed `AppError` base (carrying `statusCode`) in `src/shared/errors.ts`.
- A Fastify `setErrorHandler` maps errors to status + a useful JSON message, preserves Fastify's own
  status codes (e.g. 415), and masks 5xx detail:
  - `400` - missing/empty body, or not a valid MPEG-1 LIII stream
  - `413` - upload exceeds the max size
  - `415` - unsupported / missing content type
  - `500` - unexpected (logged; generic message to client)
- Always respond with JSON and the correct `content-type`.

## Testing

- `node:test` + `node:assert`; the app is driven in-process via Fastify's `app.inject()` (no sockets).
- Unit tests cover the parser and byte-reader using **synthetic frames** built in-memory, plus the
  header decode and frame-length math.
- An end-to-end test counts the real `samples/sample_001.mp3` and asserts **6090** frames.
- Tests are colocated with the code as `*.test.ts`.

## Security

- Enforce a maximum upload size (`MAX_UPLOAD_BYTES`) to bound memory and mitigate DoS.
- Validate content type. Don't trust client-provided length / filename.

## Observability

- Use Fastify's built-in logger (pino). Structured logs; no `console.log` in app code.

## Referenced config (source of truth - don't duplicate here)

- `package.json` - scripts, dependencies, engines
- `tsconfig.json` - strict TS + run-via-Node settings
- `biome.json` - format + lint rules
- `Dockerfile` / `.dockerignore` - production image
- `spy-fidelity.code-workspace` - VS Code workspace + F5 debug configs
- `.gitignore`
