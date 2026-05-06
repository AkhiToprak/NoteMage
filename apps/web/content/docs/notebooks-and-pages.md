---
title: Notebooks and pages
description: Notebooks, sections, and the two kinds of pages — text and canvas.
category: The notebook
order: 20
---

Notemage organizes your work into **notebooks → sections → pages**. A notebook is a course, a project, a topic; a section is a chapter or unit; a page is a single document you write or draw on.

## Notebooks

A notebook is the top-level container. It owns its sections, pages, documents, flashcard sets, quiz sets, study plans, and chats. You can have as many notebooks as you want, and you can group them into folders from the Notebooks page.

You can share, or download shared notebooks. Sharing is covered in [Groups and sharing](/docs/groups-and-sharing).

## Sections

Sections are the slot between a notebook and its pages. Use them to chunk a notebook by week, by chapter, or by theme — whatever the material wants.

A section can also be the import target. If you import a `.pptx` or `.xlsx` file, you tell Notemage which section the resulting pages go into.

## Pages

A page is what you actually read, write, and study from. Notemage has two kinds:

### Text pages

Rich-text editor with formatting, headings, lists, links, and inline images. Most notes live here. Text pages are also what AI features chew on — when Mage Chat reads a "page as context," it's reading the text content of that page.

Inline AI tools (rewrite / summarize / expand) live in a selection toolbar on text pages. See [Inline AI](/docs/inline-ai).

### Canvas pages

A full Excalidraw surface for drawing, diagramming, sketching equations, mind-mapping by hand. Stylus-friendly, with pen / text / eraser tools and a custom background colour picker. The full story is in [Infinite canvas](/docs/infinite-canvas).

## Routes you'll use

- **/notebooks** — list of all your notebooks.
- **/notebooks/[id]** — a notebook home with sections, pages, chats, flashcards, quizzes, and study plans.
- **/notebooks/[id]/pages/[pageId]** — the page editor (text or canvas, picked automatically by `pageType`).

## Autosave

Notemage saves as you work. Text pages save when you stop typing; canvas pages debounce roughly every two seconds while you're drawing, and again when the title changes. You don't need to hit save manually.
