---
title: Flashcards
description: Build, study, import, and export flashcard decks — manually or with AI.
category: Study tools
order: 31
---

Flashcards in Notemage are spaced-repetition decks that live inside a notebook. Each card has a question on the front and an answer on the back. Cards can carry hints, explanations, and images.

## Three ways to make a deck

### 1. Manually

Open a notebook → flashcards → **New flashcard set**. Type cards yourself, one front/back pair at a time. Use this when you have very specific terminology you want to control.

### 2. With AI

Open Mage Chat in the notebook, attach the page (or document) you want to study, and ask:

> "Make 25 flashcards from this page on the citric acid cycle."

Mage Chat picks the `create_flashcards` tool, drafts the deck, and saves it back to the notebook. You can edit any card afterwards.

Or simply click the AI icon in the toolbar while editing your textfile and tell it to create flashcards!

### 3. By import

Notemage can import existing decks. The supported sources are:

- **Quizlet** — paste a csv export from Quizlet.
- **CSV** — one card per row.
- **JSON** — for power users moving decks between tools.

The import dialog walks you through the format options.

## Studying a deck

A deck opens at **/notebooks/[id]/flashcards/[setId]**. The viewer flips cards on click and tracks each card's review state — `new`, `learning`, `reviewing`, `relearning`, or `learned`. As you study, the deck shifts cards through those buckets so you spend more time on what you don't know yet.

## Export to .pptx and .pdf

Any deck can be exported to:

- **PDF** — for printing or sharing.
- **PowerPoint (.pptx)** — for presenting in front of a class or quiz session.

The .pptx export builds a slide for each card in the deck.

## Limits

AI-generated flashcard sets count against a monthly cap:

- **Free** — 1 AI-generated flashcard set / month.
- **Plus** — 4 AI-generated flashcard sets / month.
- **Pro** — unlimited.

Manually-created and imported decks are unlimited on every plan. See [Plans and limits](/docs/plans-and-limits).

## Related docs

- [Quizzes](/docs/quizzes) — multiple-choice tests, the natural counterpart to flashcards.
- [Mage Chat](/docs/mage-chat) — how to ask the AI for a deck.
- [Presentations](/docs/presentations) — for the bigger story on PowerPoint exports.
