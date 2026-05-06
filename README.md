# Notemage

AI-powered study companion that turns your notes into an interactive learning experience.

![Notemage Logo](/brand_assets/notemagelogos/icon_with_text-bg.png)

## What is Notemage?

Notemage is a full-stack study platform that combines a OneNote-style notebook editor with AI capabilities powered by Claude. Upload documents, take notes, and let AI generate flashcards, quizzes, summaries, and study plans — all in one place.

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

## Status

Notemage is currently in active development and will be available as a hosted platform soon. This repository is public for transparency — it is **not** intended for self-hosting or cloning.

## License

Copyright (c) 2026 Toprak Demirel. All rights reserved. See [LICENSE](LICENSE) for details.
