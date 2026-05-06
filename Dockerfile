# syntax=docker/dockerfile:1.7
# Multi-stage build for the Notemage Next.js app (apps/web).
# Build context MUST be the monorepo root so the workspace lockfile +
# packages/shared are visible. In Coolify: Base Directory = `.`,
# Dockerfile Location = `Dockerfile`, Build Context = `.`.

ARG NODE_VERSION=20-alpine
ARG PNPM_VERSION=9.12.0

# ── Base ───────────────────────────────────────────────────────────────
# libc6-compat + openssl are required by Prisma on alpine.
# python3/make/g++ are needed to compile native modules (better-sqlite3,
# @napi-rs/canvas) when no prebuilt binary matches the alpine target.
FROM node:${NODE_VERSION} AS base
RUN apk add --no-cache libc6-compat openssl python3 make g++
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /repo

# ── Deps ───────────────────────────────────────────────────────────────
# Copy only the manifests + the prisma schema (needed by the
# `postinstall: prisma generate` hook) so this layer caches across
# unrelated source edits.
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
COPY apps/web/prisma apps/web/prisma
RUN pnpm install --frozen-lockfile

# ── Builder ────────────────────────────────────────────────────────────
# NEXT_PUBLIC_* vars are baked into the client bundle at build time —
# they MUST be set as ARGs (and toggled "Is Build Variable" in Coolify)
# or the browser will see undefined for them.
FROM base AS builder
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/web/node_modules ./apps/web/node_modules
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages packages
COPY apps/web apps/web

ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_SENTRY_DSN
ARG SENTRY_AUTH_TOKEN
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN
ENV SENTRY_ORG=$SENTRY_ORG
ENV SENTRY_PROJECT=$SENTRY_PROJECT

RUN pnpm --filter web exec next build

# ── Runner ─────────────────────────────────────────────────────────────
# Standalone output preserves the monorepo structure under .next/standalone/
# because next.config.ts sets outputFileTracingRoot to the workspace root.
# Final image runs as a non-root user.
FROM node:${NODE_VERSION} AS runner
RUN apk add --no-cache libc6-compat openssl
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001 -G nodejs

COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/prisma ./apps/web/prisma

RUN npm install -g prisma@5.22.0

USER nextjs
EXPOSE 3000
CMD ["sh", "-c", "prisma migrate deploy --schema=./apps/web/prisma/schema.prisma && node apps/web/server.js"]
