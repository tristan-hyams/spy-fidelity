# spy-fidelity

An HTTP API that counts the audio frames in an **MPEG-1 Audio Layer III (MP3)** file. Upload an
MP3 to `POST /file-upload`; the bytes are streamed through a hand-written frame parser and the
frame count is returned as JSON.

> **Scope:** MPEG Version 1, Layer III - the near-universal `.mp3` format. Other MPEG variants
> are intentionally out of scope. MP3 frame parsing is hand-written (no third-party MP3 library).

## Requirements

- **Node.js ≥ 24** (developed on 25). TypeScript runs directly via Node's native type-stripping -
  there is **no build step**.
- npm - or just **Docker** (see below).

## Tech stack & why

Versions use caret ranges pinned for consistency; `package.json` is the source of truth.

| Component | Version | Why this choice |
|---|---|---|
| **Node.js** | ≥ 24 LTS (dev on 25) | Runs `.ts` directly via native **type-stripping** - no build/transpile step. The LTS line is the production target. |
| **TypeScript** | `^6.0.3` | Strict static typing. Types are erased by Node at runtime, so TS is used purely for `tsc --noEmit` type-checking. |
| **Fastify** | `^5.8.5` | Performance-focused, production-standard Node HTTP framework with first-class TypeScript types and excellent **streaming** support - ideal for piping large uploads straight through the parser. |
| **Biome** | `^2.5.0` | One fast Rust-based tool for **formatting + linting** (replaces ESLint + Prettier), keeping the toolchain minimal and consistent. |
| **@types/node** | `^24` | Pinned to the **Node 24 LTS** floor (the deployment target), *not* the newest types - so type-checks reflect the APIs that actually ship in the container. |
| **node:test** | built-in | Zero-dependency test runner, paired with Fastify's `app.inject()` for fast in-process HTTP tests. |

**Architecture:** layered (n-tier) discipline organised as a vertical feature slice with a separate
leaf `shared/`; **Pure DI** via `create*` factory functions wired in a single composition root (no DI
container or service locator at this scale); the parser consumes a byte **stream**, so memory stays
flat on large files. MP3 frame parsing is **hand-written** per the brief - no third-party MP3 library.

**Why not the alternatives:** Express (slower, weaker TS/streaming story), Hono (excellent but
optimised for edge/serverless), and NestJS (heavier, and its DI container is overkill for one
endpoint) were all considered - Fastify is the best balance of performance, TypeScript ergonomics,
and streaming for this task.

## Quick start

```bash
npm run setup    # one-shot: install deps + verify (typecheck, lint, tests)
npm run dev      # auto-reloading server on http://localhost:3000
```

> `npm run setup` prepares a workstation for **local debugging** (no Docker). To only install
> dependencies, plain `npm install` works too.

Count the frames in a file:

```bash
curl -X POST \
  -H "Content-Type: audio/mpeg" \
  --data-binary @samples/sample.mp3 \
  http://localhost:3000/file-upload
# => {"frameCount":<number>}
```

## API

### `POST /file-upload`

| | |
|---|---|
| **Request body** | Raw MP3 bytes, streamed. `Content-Type: audio/mpeg` or `application/octet-stream`. |
| **`200`** | `{ "frameCount": <number> }` &nbsp;(`application/json`) |
| **`400`** | Body is missing or not a valid MPEG-1 Layer III stream |
| **`413`** | Upload exceeds the size limit (100 MB) |
| **`415`** | Unsupported or missing `Content-Type` |
| **`500`** | Unexpected error |

The body is **streamed** to the parser rather than buffered, so memory stays flat regardless of
file size.

## npm scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start the server with `--watch` (auto-reload) on port 3000 |
| `npm start` | Start the server |
| `npm test` | Run the test suite (Node's built-in test runner) |
| `npm run typecheck` | Type-check the project (`tsc --noEmit`) |
| `npm run lint` | Lint with Biome |
| `npm run format` | Format with Biome (writes changes) |
| `npm run check` | Biome lint + format check (CI-friendly, no writes) |
| `npm run setup` | One-shot local workstation setup: `npm ci` + typecheck + Biome check + tests |

The listen port is configurable via the **`PORT`** environment variable (default **`3000`**).

## Docker

```bash
docker build -t spy-fidelity .
docker run --rm --init -p 3000:3000 spy-fidelity
```

The image installs only production dependencies, runs the TypeScript source directly (Node
type-stripping - no transpile step), and runs as a non-root user.

## Debugging (VS Code)

Open **`spy-fidelity.code-workspace`** and press **F5** (the *Debug server* configuration) to launch
the API with breakpoints; a *Debug tests* configuration is included too. Install the recommended
**Biome** extension for format-on-save.

## Project layout

A layered (n-tier) design, organised as a vertical feature slice with a separate leaf `shared/`:

```
src/
  server.ts              composition root - wires dependencies and listens
  app.ts                 buildApp(): Fastify instance, content-type parser, error handler
  features/file-upload/  the upload feature slice: controller, service, parser, models, tests
  shared/                leaf utilities - byte-stream size guard, domain errors
```

- **[docs/STRUCTURE.md](docs/STRUCTURE.md)** - package layout, dependency direction, integration points
- **[docs/RULES.md](docs/RULES.md)** - conventions, tooling, and commands

## Testing

```bash
npm test
```

Tests drive the app in-process via Fastify's `app.inject()` (no real sockets). The end-to-end
frame-count test is skipped until the parser is implemented and `samples/sample.mp3` is added.

## Status

The HTTP layer, dependency-injection wiring, error handling, tooling, and tests are complete. The
MPEG-1 Layer III frame parser
([`src/features/file-upload/mp3-frame-parser.ts`](src/features/file-upload/mp3-frame-parser.ts)) is
the remaining piece - see its step-by-step TODO.
