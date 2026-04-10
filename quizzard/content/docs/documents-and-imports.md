---
title: Documents and imports
description: Bring in PDFs, Word docs, plain text, OneNote, YouTube transcripts, and web pages.
category: The notebook
order: 22
---

Most study material doesn't start in Notemage. The import system pulls source material into a notebook so the AI features can read it and so you can build flashcards / quizzes / decks from it.

## Supported file uploads

You can upload these directly to a notebook:

- **PDF** — text is extracted automatically.
- **DOCX** (Microsoft Word) — text is extracted automatically.
- **TXT** — plain text.
- **MD** — Markdown.

Once a document is uploaded, its extracted text is stored alongside the original file. That extracted text is what Scholar Chat reads when you add the document as context, and it's what's used for AI summaries and study-tool generation.

## Document summaries

Each uploaded document can be summarized by AI in two flavours:

- **Brief** — short, dense recap.
- **Detailed** — section-by-section walkthrough.

Summaries count against your monthly token budget. See [Plans and limits](/docs/plans-and-limits).

## OneNote import

Notemage supports importing from Microsoft OneNote via OAuth. Connect your Microsoft account, pick a OneNote section, and Notemage will pull the pages in. Setup requires the Microsoft side to be configured for your account.

## YouTube transcripts

Drop in a YouTube URL and Notemage fetches the transcript and stores it like any other document. From there you can chat about the video, generate flashcards from the transcript, or build a study plan around it.

## URL imports

You can also import web pages. Notemage scrapes the page, extracts the readable text, and saves it as a document.

## Section-level imports

Two import paths target a **section** rather than a notebook:

- **Import .pptx** — turns a PowerPoint deck into pages inside the chosen section, one page per slide.
- **Import .xlsx** — turns a spreadsheet into pages inside the chosen section.

Use these when you have lecture decks or worksheets you want to read and annotate inside Notemage.

## Where this hooks in

- **[Scholar Chat](/docs/scholar-chat)** can read any uploaded document as context.
- **[Flashcards](/docs/flashcards)** and **[Quizzes](/docs/quizzes)** can be AI-generated from a document just like from a page.
- **[Presentations](/docs/presentations)** can be generated from a document via Scholar Chat.
