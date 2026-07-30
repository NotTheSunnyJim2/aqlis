# node:22-slim (Debian/glibc), not node:22-alpine (musl) — decided back in
# Phase 3 so this base matches CI's Ubuntu runners and avoids glibc/musl
# surprises in native deps (pg, Prisma's query engine).

FROM node:22-slim AS build
WORKDIR /app

# Prisma's query engine binary needs libssl at both generate-time (to pick
# the right engine for this platform) and runtime — Debian slim images
# don't ship it by default, and its absence fails opaquely ("Unable to
# require libquery_engine..."), so it's installed explicitly up front.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# package.json files copied before the rest of the source so `npm ci`
# only reruns on a dependency change, not on every source edit — full
# install here (dev deps included) since tsc/vite need them to build.
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY apps/server apps/server
COPY apps/web apps/web

# src/generated/prisma is gitignored (Phase 9) — regenerated here rather
# than trusted from the build context, so the shipped client always
# matches this exact schema.prisma, never a stale local artifact.
RUN npm run generate --workspace=@aqlis/server
RUN npm run build

# apps/server/public is a sibling of dist/ by design (see app.ts /
# index.ts — same relative path resolves whether the entrypoint is
# src/index.ts under tsx or dist/index.js under node).
RUN mkdir -p apps/server/public && cp -r apps/web/dist/. apps/server/public/


FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# Only apps/server's package.json is copied — npm workspaces are
# discovered by globbing "apps/*" on disk, so with apps/web absent here,
# `npm ci` never even considers its (frontend-only) dependencies. That
# keeps the production install to exactly what apps/server needs, no
# React/Vite bloat, without hand-maintaining a separate lockfile.
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
RUN npm ci --omit=dev

# prisma/ + prisma.config.ts: not part of the compiled dist/ output, but
# required at runtime by Fly's release_command (`prisma migrate deploy`,
# fly.toml, next step) — it reads schema.prisma and the migrations
# directory directly, via the CLI now shipped as a production dependency.
COPY apps/server/prisma apps/server/prisma
COPY apps/server/prisma.config.ts apps/server/prisma.config.ts
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/server/public apps/server/public

# node:22-slim ships a non-root `node` user (uid 1000) for exactly this —
# the API server and workers don't need root, so don't run as root.
RUN chown -R node:node /app
USER node

WORKDIR /app/apps/server
EXPOSE 3000

# Overridden per Fly process group (fly.toml, next step) for the three
# workers — this default is the API server.
CMD ["node", "dist/index.js"]
