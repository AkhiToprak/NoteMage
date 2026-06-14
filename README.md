# Notemage

AI-powered study companion that turns your notes into an interactive learning experience.

![Notemage Logo](/brand_assets/notemagelogos/icon_with_text-bg.png)

## What is Notemage?

Notemage is a full-stack, multi-platform study platform that combines a OneNote-style notebook editor with AI capabilities powered by Claude and Gemini. Upload documents, take notes on an infinite canvas, and let AI generate flashcards, quizzes, summaries, and full Duolingo-style learning paths — all in one place.

It ships as a single web app (the authoring surface) wrapped by native shells: an Electron desktop app and an Expo/React Native mobile companion.

## Features

- **Notebook Editor** — Rich text editor (TipTap) with sections, pages, tables, code blocks (syntax-highlighted via lowlight), KaTeX math, and an infinite canvas (tldraw / Excalidraw)
- **AI Chat** — Chat with Claude/Gemini about your notes and uploaded documents; intent-gated so plain Q&A stays cheap and "make me a quiz" routes to generation
- **Learning Paths** — Duolingo-style generated courses: a structured spine of theory → flashcards → quizzes → assessments, with checkpoints and pass gates
- **Flashcards with Spaced Repetition** — SM-2 algorithm schedules reviews for optimal retention
- **Quiz Engine** — 11+ question kinds (multiple choice, fill-blank, word bank, match pairs, sentence reorder, equation grading, code-output/code-write, timeline, translation, diagram cloze) with attempt tracking and progress charts
- **Document Import** — Upload PDFs, Word docs, PowerPoints, spreadsheets, or paste YouTube URLs to extract transcripts and notes
- **PDF Import (hybrid)** — pdf.js text extraction + a vision LLM for per-page structure (headings, lists, tables, figures, math)
- **Video-as-context** — Free transcript ingestion and (Pro) native Gemini video understanding into timestamped notes
- **One-Click Summaries** — Brief or detailed summaries of any uploaded document, cached per doc
- **Essay Feedback** — Grammar, spelling, clarity, and structure analysis
- **Study Groups & Real-time Collaboration** — Socket.io-powered co-work sessions with page locking and presence
- **Exam Countdown & Study Planner** — Add exam dates and let AI generate a fitted study plan
- **Gamification** — Streaks (with freeze mechanic), full-screen celebration takeovers, app-wide haptics, and unlockable cosmetic achievements
- **Community** — Publish notebooks and learning paths, browse shared content, rate and review, with layered moderation and trust scoring

## Architecture

### Monorepo

Notemage is a **pnpm workspace monorepo** (`pnpm@9.12.0`, Node 20).

```
Quizzard/
├── apps/
│   ├── web/        # Next.js 16 app — the full-stack platform & authoring surface
│   ├── mobile/     # Expo / React Native shell (iOS + Android)
│   └── desktop/    # Electron shell (Windows/macOS)
├── packages/
│   └── shared/     # Cross-platform TypeScript: native-bridge protocol, quiz/path domain types
└── Dockerfile      # Multi-stage build, the deploy artifact
```

The **web app is the source of truth**. The desktop and mobile shells wrap `https://notemage.app` in a WebView/Electron window and add native integrations (haptics, biometrics, sharing, push, Apple Pencil, in-app purchases) over a single shared bridge protocol defined in `packages/shared`.

### Platforms

| Platform | Stack | Notes |
|----------|-------|-------|
| **Web** | Next.js 16 (App Router), React 19, Tailwind 4 | Primary authoring surface — canvas, AI generation, notebooks |
| **Desktop** | Electron 33 + electron-builder | Single-instance lock, system tray, auto-update via GitHub releases; loads the hosted web app |
| **Mobile** | Expo SDK 54, React Native 0.81 | Study companion (paths/cards), native bridge, Apple Pencil module, RevenueCat IAP |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Frontend | React 19, Tailwind CSS 4 |
| Database | Supabase (PostgreSQL) + Prisma ORM |
| Storage | Supabase Storage (signed-URL direct uploads) |
| Auth | NextAuth.js (credentials + Google + Apple OAuth) |
| AI | Anthropic Claude SDK + Google Gemini |
| Real-time | Socket.io (standalone WS server) |
| Editor | TipTap |
| Canvas | tldraw / Excalidraw |
| Rate limiting | Upstash Redis |
| Bot protection | Cloudflare Turnstile |
| Payments | Lemon Squeezy (web/desktop) + RevenueCat (iOS) |
| Monitoring | Sentry + PostHog |
| CI | GitHub Actions |
| Hosting | Coolify (self-hosted on Hetzner) |
| Container | Docker |

## AI & Prompt Engineering

AI is the core of the product, and a lot of the engineering goes into making it **cheap, fast, and reliable** without sacrificing quality.

### Model composition & routing

A single resolver (`src/lib/model-routing.ts`, `resolveModel()`) routes every AI feature to the right provider and model. Four model tiers are composed across two providers:

- **Anthropic** — Claude Haiku 4.5 (budget/fast), Claude Sonnet 4.6 (high-quality)
- **Google Gemini** — Gemini 2.5 Flash, Gemini 2.5 Flash-Lite (cheapest)

Routing is **per-feature and per-tier**, not a blanket "free = cheap model". For example: plain chat runs on Flash for all tiers; generation intents (quiz, flashcards, study plans) always run on Anthropic; learning-path theory and flashcards drop to Flash-Lite while premium ("ultra") path structure is upgraded to Sonnet; video ingestion is Gemini-only (native video API). Every routing decision is overridable via environment tokens, and a single `MODEL_COMPOSITION_LEGACY=1` switch reverts the whole app to the previous routing if a model regresses. A `CHAT_GEMINI_DISABLED` kill-switch forces chat back to Anthropic instantly.

### Two-stage learning-path generation

Generating a full course is a two-stage pipeline:

1. **Stage A — structure:** one call produces the curriculum spine (phases → ordered slots, each tagged `learning` / `review` / `assessment`).
2. **Stage B — content:** dozens of parallel/sequential calls fill each slot — theory + flashcards for learning slots, flashcards + quiz for review slots, quiz-only for assessments — each with its own retry budget so one bad slot doesn't fail the whole path.

Prompt builders live in `src/lib/path-prompts.ts` and emit a `{system, tail}` split so the static, cacheable part of the prompt is byte-stable across calls. Tool/output schemas are derived from a single source so both providers validate against the same shapes (a shared Zod validator), and subject-specific pedagogy fragments constrain tone and which question kinds the model may emit per subject.

### Prompt caching

Repeated and batched calls use **provider prompt caching** aggressively:

- **Anthropic** `cache_control` (ephemeral) on the static prefix — 1h TTL for Stage B (many reads amortize the write), 5m for single-shot Stage A.
- **Gemini** implicit caching for single calls, explicit `CachedContent` for the high-read path stages.
- The tool array is kept **stable** and only `tool_choice` changes between turns — swapping tool definitions would invalidate the cache, so that invariant is load-bearing.

### Chat intent gating

Chat classifies intent **sync-first** (regex/keyword heuristics, zero cost) and only falls back to a cheap forced-tool LLM call when ambiguous. Plain Q&A carries no tools; a generation request selects exactly one tool via `tool_choice`. This keeps the common case (a question) on the cheapest path.

### Cost controls & metering

- Every AI call logs tokens and computed USD cost to an `AiUsageEvent` table (fire-and-forget, never blocks the request).
- Quotas are enforced with an **atomic reserve** (`reserveUsage()` with an advisory lock) to avoid TOCTOU races, with a refund path for failed calls.
- A per-user token budget gates spend across **all** AI surfaces, not just chat.
- Video jobs are pre-flighted against a USD ceiling from duration, and output is hard-capped to prevent runaway generation.

## Security

Security is treated as defense-in-depth across auth, abuse prevention, and untrusted input. The codebase has been through multiple full audits (reports live in `apps/web/docs/security-audit-*.md` and `security-remediation-*.md`), each followed by a remediation pass.

- **Authentication** — NextAuth with JWT sessions. Credentials use bcrypt (cost 12) with a constant-time compare that runs even for non-existent users (no timing-based email enumeration). Failed-login counting is atomic; repeated failures trigger account lockout. Email confirmation (via Resend) is a hard gate for new credentials signups. OAuth (Google/Apple) verifies the provider's `email_verified` claim before linking.
- **Rate limiting** — Upstash Redis sliding-window limiters. Auth and cost-sensitive routes **fail closed in production** (a Redis outage blocks rather than unguards), and a global per-IP throttle in middleware acts as a DDoS shock-absorber on self-hosted infra.
- **Bot protection** — Cloudflare Turnstile gating, wired adaptively: a login challenge appears after repeated failures from an IP rather than on every request.
- **Sandboxed math** — User-supplied equation answers are graded server-side, so the math evaluator is a hardened mathjs instance (`src/lib/safe-math.ts`) with dangerous functions disabled and the library pinned past known sandbox-escape CVEs. All user math goes through this path — never raw `evaluate`.
- **Encryption at rest** — Third-party OAuth tokens (Microsoft Graph) are encrypted with AES-256-GCM under a dedicated key, fresh IV per token, with tamper detection that forces reconnect.
- **HTTP hardening** — Strict security headers (HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` locking camera/mic/geo) plus a Content-Security-Policy. WebSocket presence tokens are HMAC-signed and verified in constant time with an enforced audience claim and expiry.
- **PII & input handling** — IP addresses are stored only as salted HMACs. Uploads enforce byte caps before parsing (anti parse-bomb). Security-relevant events (logins, lockouts, password changes, OAuth links) are recorded to an audit log.
- **Age gating** — Minimum age 13, validated against a strict birth-date format with implausible-date rejection.

## Data Layer

- **80+ Prisma models** over Supabase PostgreSQL, covering users/tiers, notebooks/pages, documents/imports, flashcards, the multi-kind quiz engine, learning paths (study plans → phases → theory/checkpoints → attempts), AI chat, real-time co-work, social/community publishing, moderation/trust, gamification, and AI usage metering.
- Connection via `DATABASE_URL` (with optional `DIRECT_URL` to bypass the pooler).
- Migrations run automatically at container start (`prisma migrate deploy`), so a push to `main` self-applies its schema on deploy.

## Real-time Collaboration

A **standalone Socket.io server** (`apps/web/ws-server.ts`, separate process/port) handles presence and co-work sessions. It verifies signed presence tokens, tracks online/offline state with batched `lastSeenAt` writes, and coordinates **page locks** so two people don't edit the same page at once. Heartbeats are tuned to survive reverse-proxy idle timeouts.

## Payments & Billing

A single `User.tier` (`FREE | PRO`) plus an `entitlementSource` enum decouples gating from the billing provider, so entitlement can come from any channel without changing app logic:

- **Web & Desktop** — Lemon Squeezy as Merchant of Record (handles EU VAT/tax). One Pro product, three intervals (weekly / monthly / yearly). Webhooks sync subscription state.
- **iOS** — RevenueCat over StoreKit IAP, keyed by the user ID, with Apple's original-transaction ID stored for idempotent restore/transfer.

## Deployment

Notemage runs as a hosted platform at [notemage.app](https://notemage.app). It is **not** designed to be run locally or self-hosted from this repository.

- **Hosting** — Self-hosted [Coolify](https://coolify.io/) on a Hetzner server. Coolify auto-deploys on every push to `main` via webhook.
- **Build** — A multi-stage `Dockerfile` is the deploy artifact: it builds the standalone Next.js output and runs it as a non-root container on Node 20 Alpine.
- **Startup** — The container runs `prisma migrate deploy` then boots the server, so migrations apply themselves on each deploy.
- **Database & storage** — Supabase provides Postgres and object storage; file uploads PUT directly to Supabase Storage via signed URLs, bypassing the app server.
- **Observability** — Sentry for errors, PostHog for product analytics.

## Status

Notemage is in active development across web, desktop, and mobile. This repository is public for transparency — it is **not** intended for self-hosting or cloning.

## License

Copyright (c) 2026 Toprak Demirel. All rights reserved. See [LICENSE](LICENSE) for details.
