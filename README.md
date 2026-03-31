# Quizzard

AI-powered study companion that turns your notes into an interactive learning experience.

![Quizzard Logo](brand_assets/quizzard_logo.png)

## What is Quizzard?

Quizzard is a full-stack study platform that combines a OneNote-style notebook editor with AI capabilities powered by Claude. Upload documents, take notes, and let AI generate flashcards, quizzes, summaries, and study plans — all in one place.

## Features

- **Notebook Editor** — Rich text editor (TipTap) with sections, pages, tables, code blocks, and an infinite canvas (tldraw)
- **AI Chat** — Chat with Claude about your notes and uploaded documents
- **Flashcards with Spaced Repetition** — SM-2 algorithm schedules reviews for optimal retention
- **Quiz Generation & Score History** — AI-generated quizzes with attempt tracking and progress charts
- **Document Import** — Upload PDFs, Word docs, PowerPoints, spreadsheets, or paste YouTube URLs to extract transcripts
- **OneNote Import** — Import notebooks directly from Microsoft OneNote via Graph API
- **One-Click Summaries** — Claude generates brief or detailed summaries of any uploaded document
- **Essay Feedback** — Grammar, spelling, clarity, and structure analysis powered by Claude
- **Study Groups** — Create groups, share notebooks, and collaborate with friends
- **Exam Countdown & Study Planner** — Add exam dates and let Claude generate a fitted study plan
- **Gamification** — XP, levels, streaks (with freeze mechanic), and 17 unlockable achievements
- **Community** — Publish notebooks, browse shared content, rate and review
- **Real-time Collaboration** — Socket.io-powered co-work sessions with page locking

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Frontend | React 19, Tailwind CSS 4 |
| Database | PostgreSQL + Prisma ORM |
| Auth | NextAuth.js |
| AI | Anthropic Claude SDK |
| Real-time | Socket.io |
| Editor | TipTap |
| Canvas | tldraw |
| Monitoring | Sentry |
| CI | GitHub Actions |

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL database
- [Anthropic API key](https://console.anthropic.com/) for AI features

### Setup

```bash
# Clone the repo
git clone https://github.com/your-username/Quizzard.git
cd Quizzard/quizzard

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your database URL, API keys, etc.

# Generate Prisma client and run migrations
npx prisma generate
npx prisma migrate dev

# Start the dev server
npm run dev
```

The app will be available at `http://localhost:3000`.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | Yes | Random secret for session encryption |
| `NEXTAUTH_URL` | Yes | App URL (e.g. `http://localhost:3000`) |
| `ANTHROPIC_API_KEY` | Yes | Claude API key for AI features |
| `AZURE_CLIENT_ID` | No | Azure app ID for OneNote import |
| `AZURE_CLIENT_SECRET` | No | Azure app secret for OneNote import |
| `AZURE_TENANT_ID` | No | Azure tenant (use `common` for multi-tenant) |
| `NEXT_PUBLIC_SENTRY_DSN` | No | Sentry DSN for error monitoring |

### Docker

```bash
# Development
docker compose up

# Production
docker compose -f docker-compose.prod.yml up
```

## Project Structure

```
Quizzard/
  brand_assets/          # Logo and style guidelines
  .github/workflows/     # CI pipeline
  quizzard/              # Next.js application
    app/                 # App Router pages and API routes
      (dashboard)/       # Authenticated app pages
      api/               # REST API endpoints
    prisma/              # Database schema and migrations
    src/
      components/        # React components
      lib/               # Utilities (AI, XP, streaks, spaced repetition, etc.)
```

## License

Copyright (c) 2026 Toprak Demirel. All rights reserved. See [LICENSE](LICENSE) for details.
