# RULES - spy-fidelity

Coding rules, conventions, and commands for this project.
Architecture and package layout live in **[STRUCTURE.md](STRUCTURE.md)**.

> Status: implemented. The HTTP layer, DI wiring, error handling, tooling, and tests follow
> the conventions below; the MPEG‑1 Layer III parser is implemented. Treat this as
> the agreed standard and keep it in sync as code lands.

## What this is

An HTTP API that counts the audio frames in an MPEG‑1 Audio Layer III (MP3) file.
Single endpoint: `POST /file-upload` → `{ "frameCount": <number> }`.
MP3 frame parsing is **hand-written** - see constraints below.

## Toolchain

- **Runtime:** Node.js ≥ 24 (developed on 25). Runs `.ts` directly via type‑stripping - no build step.
- **Language:** TypeScript, `strict`. ESM (`"type": "module"`).
- **HTTP framework:** Fastify.
- **Format + lint:** Biome - config in `biome.json`.
- **Type-check:** `tsc --noEmit` - config in `tsconfig.json`.
- **Tests:** Node's built-in runner (`node:test` + `node:assert`).

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Watch-run the server |
| `npm start` | Run the server |
| `npm test` | Run tests |
| `npm run typecheck` | Type-check only (`tsc --noEmit`) |
| `npm run lint` / `npm run format` / `npm run check` | Biome lint / format / both |

## Architecture rules (layered discipline)

- **Layers, dependencies point DOWN only - never up, no cycles:**
  Presentation (controllers / Fastify route plugins) → Application (services / business
  logic) → Domain (pure parsing core).
- A persistence / Repository layer is **intentionally absent** (nothing is persisted). If
  persistence is ever added, it sits below services behind an interface.
- **Depend on interfaces, not concrete implementations**, at every seam.
- **Pure DI:** each unit exposes a `create<Name>(deps): <Interface>` factory (Go-style).
  The composition root (`src/server.ts`) is the **only** place that constructs the concrete
  graph. No DI container and no service locator at this scale - awilix / `@fastify/awilix`
  is the documented scale-up path if the graph grows or request-scoping is needed.
- `buildApp(deps)` returns a configured Fastify instance; `server.ts` wires deps and calls
  it. Tests drive the app via `app.inject()` (no real sockets).

## Project organization ("localization")

- **Vertical feature slices:** `src/features/<feature>/` holds that feature's controller,
  service, domain logic, models, and colocated tests.
- **Shared utility code is kept separate** in `src/shared/` and MUST be **leaf** code -
  pure, dependency-free, and it must **not** import from `src/features/`.
- Features never import other features; cross-feature reuse goes through `src/shared/`.
- Concrete tree: see STRUCTURE.md.

## Streaming & performance

- The MP3 parser consumes an `AsyncIterable<Uint8Array>` (a byte stream), **not** a fully
  buffered `Buffer`. Never load the whole file into memory → O(1) memory regardless of size.
- Fastify buffers/parses request bodies by default. Register a **raw content-type parser**
  for the audio body (`audio/mpeg` / `application/octet-stream`) that passes the stream
  through unbuffered, preserving streaming.
- The parser touches only the 4 header bytes per frame and skips frame payloads.

## TypeScript conventions

- `strict` + `noUncheckedIndexedAccess` (see `tsconfig.json`). No `any` - use `unknown` + narrowing.
- Explicit return types on exported functions.
- Interfaces named for their role, **no Hungarian `I` prefix** (`Mp3FrameParser`, not `IMp3FrameParser`).
- `import type` for type-only imports (`verbatimModuleSyntax` is on).

## Naming

- Files: kebab-case (`file-upload.controller.ts`, `mp3-frame-parser.ts`).
- Types / interfaces / classes: PascalCase. Functions / vars: camelCase.
- True constants (e.g. lookup tables): UPPER_SNAKE_CASE.
- Factory functions: `create<Name>`.

## MP3 parsing constraints (from the assignment)

- **Scope:** MPEG Version 1, Audio Layer III only. Other MPEG formats are out of scope.
- **Must not** use an npm package to parse MP3 frame data. HTTP/utility packages are fine.
- Frame length (MPEG‑1 LIII): `floor(144 * bitrate / sampleRate) + padding`.
- Skip a leading ID3v2 tag (`"ID3"` magic, syncsafe size) before counting.

## Error handling

- Domain errors are typed (e.g. `InvalidMp3Error`) and live in `src/shared/` (or the feature
  when feature-specific).
- A Fastify `setErrorHandler` / the controller maps errors to an HTTP status + a useful JSON message:
  - `400` - body isn't a valid MPEG‑1 LIII stream
  - `413` - upload exceeds the configured max size
  - `415` - unsupported / missing content type
  - `500` - unexpected (logged; generic message to client)
- Always respond with JSON and the correct `content-type` header.

## Security

- Enforce a maximum upload size to bound memory and mitigate DoS.
- Validate content type. Don't trust client-provided length / filename.

## Observability

- Use Fastify's built-in logger (pino). Structured logs; no `console.log` in app code.

## Referenced config (source of truth - don't duplicate here)

- `package.json` - scripts, dependencies, engines
- `tsconfig.json` - strict TS + run-via-Node settings
- `biome.json` - format + lint rules
- `.gitignore`
