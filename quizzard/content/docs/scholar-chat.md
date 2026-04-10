---
title: Scholar Chat
description: The in-notebook AI tutor — how to give it context and what tools it can use.
category: AI features
order: 30
---

Scholar Chat is Notemage's AI tutor. It runs on **Claude Haiku 4.5** (Anthropic) and lives inside every notebook. You can ask it to explain something, quiz you, summarize a chapter, build study materials, or just talk through a tough concept.

What makes Scholar Chat different from a generic chatbot is that it can **read your notebook**. You pick which pages and documents you want it to use as context, and the AI reads them before responding.

## Starting a chat

Each notebook can have multiple chats. Each chat keeps its own message history.

1. Open a notebook.
2. Open / create a chat from the notebook sidebar.
3. The chat lives at **/notebooks/[id]/chats/[chatId]**.

## Giving the AI context

When you start a chat (or as you go), you can attach:

- One or more **pages** from the notebook.
- One or more **uploaded documents**.

Scholar Chat reads the text content of the things you attach. Attach the chapter you're studying, then ask "explain the part about diffraction" — it'll know what you mean.

## Streaming responses

Replies stream in token-by-token via Server-Sent Events, so you see the answer being written. You can read along instead of waiting for the whole reply.

## Tools the AI can call

Scholar Chat doesn't just talk — it can build things for you. The AI has access to a set of tools and decides when to call them based on what you ask:

- **`create_flashcards`** — generates a flashcard deck. Each card has a question and an answer; the AI picks the title.
- **`create_quiz`** — generates a multiple-choice quiz with hints and explanations.
- **`create_mindmap`** — generates a Markdown-hierarchy mind map that renders interactively.
- **`create_study_plan`** — generates a multi-phase study plan referencing your existing pages, flashcards, quizzes, and documents by ID.
- **`create_presentation`** — generates a rich PowerPoint deck with multiple slide types, theme colour, bullets, two-column layouts, speaker notes, and graphic descriptions. See [Presentations](/docs/presentations).
- **`recommend_videos`** — searches YouTube for tutorial videos when a visual explanation would help.

You don't call these tools directly. You just ask:

> "Make me 20 flashcards on cell mitosis from this page."

> "Build a 6-week study plan for the midterm using the chapters I've imported."

> "Turn this into a presentation."

The AI picks the right tool. The result shows up inside the chat, and (for flashcards / quizzes / mind maps / study plans / presentations) it gets saved into the notebook so you can open it from the notebook sidebar afterward.

## Limits

Scholar Chat usage counts against your monthly **token budget** plus a per-feature **message cap**:

- **Free** — 50 messages/month, 100K tokens/month.
- **Plus** — 100 messages/month, 500K tokens/month.
- **Pro** — unlimited messages, 1M tokens/month.

There's also a per-minute rate limit (~20 requests/minute) to keep the system responsive for everyone. See [Plans and limits](/docs/plans-and-limits).
