---
title: Presentations
description: Three ways to turn Notemage content into a polished PowerPoint deck.
category: Study tools
order: 33
---

Notemage can build PowerPoint presentations directly from your notebook. There are three different paths depending on how much polish you want and what you're starting from.

## Path 1 — Ask Mage Chat (most polished)

This is the path the landing page is talking about. Mage Chat has a `create_presentation` tool, and the AI knows how to use it.

1. Open a chat in your notebook.
2. Attach the **page** (or document) you want a deck about.
3. Ask:
   > "Turn this into a presentation."

Mage Chat drafts a structured deck — typically 8–15 slides — using a mix of slide types and a theme colour that fits the topic. The result opens in the **slide editor**, where you can tweak text, swap slide types, add bullets, or just hit export and call it done.

### What the AI can produce

Each slide the AI emits has:

- A **slide type** — one of `title`, `content`, `section_divider`, `two_column`, or `conclusion`. Title opens the deck, section dividers chunk it visually, content slides do the heavy lifting, two-column slides put two ideas side-by-side, and conclusion wraps things up.
- A **title** — for content slides, the AI is told to write **action titles** (a complete sentence with the takeaway), not topic labels. So you get "Early interventions cut dropout rates by 40%" rather than "Interventions."
- **Bullets** — 3–5 per content slide, ~15 words each.
- An optional **subtitle** (title and section-divider slides).
- Optional **left column / right column** content (two-column layout).
- An optional **graphic description** ("Bar chart showing growth from 2020–2024") that renders as a labelled placeholder.
- Optional **speaker notes**.
- A **theme colour** for the whole deck, picked to fit the subject (e.g. blue for science, green for biology, red for history).

### Editing before export

The slide editor lets you change titles, edit bullets, reorder slides, and tweak the theme colour before you export. You don't have to keep what the AI gave you verbatim.

## Path 2 — Export pages directly (no AI)

If you just want a basic deck of your notes — one slide per page — you can skip the AI:

- Pick the pages (or whole section) you want.
- Export to .pptx.

This builds a straightforward deck from each page's text content. No theme colour, no slide types, no speaker notes — just your notes on slides. Useful for a quick share-out.

## Path 3 — Export a flashcard or quiz set

[Flashcard sets](/docs/flashcards#export-to-pptx-and-pdf) and [quiz sets](/docs/quizzes#export) both have their own .pptx exporters. One slide per card / per question. Useful when you're running a class quiz session or a flashcard review in front of a group.

## Which path should you pick?

| Want…                                             | Use                      |
| ------------------------------------------------- | ------------------------ |
| A polished, presentable deck the AI builds for me | **Path 1** — Mage Chat   |
| A no-frills deck of my notes for a quick share    | **Path 2** — page export |
| Slides for an in-class flashcard or quiz session  | **Path 3** — set export  |

## Limits

The Path 1 (AI-generated) flow uses Mage Chat under the hood, so it counts against your monthly token budget and message cap. See [Plans and limits](/docs/plans-and-limits). Paths 2 and 3 are pure export — they don't use AI tokens.
