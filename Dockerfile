# syntax=docker/dockerfile:1

# spy-fidelity runs its TypeScript sources directly via Node's native type-stripping,
# so there is no transpile/build step - the image only needs production dependencies
# (Fastify) plus the source. `typescript`/Biome are dev-only and are not installed here.

# ---- dependencies ----------------------------------------------------------
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- runtime ---------------------------------------------------------------
FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

EXPOSE 3000
USER node
CMD ["node", "src/server.ts"]
