---
title: Infinite canvas
description: The Excalidraw-based drawing surface — pens, text, eraser, stylus support, and how it saves.
category: The notebook
order: 21
---

Canvas pages give you a full **Excalidraw** drawing surface inside Notemage. They're great for diagrams, sketches, hand-written notes, mind-mapping a topic before structuring it, or anything that doesn't fit into a text editor.

## Tools

The Excalidraw toolbar gives you the standard set:

- **Text** — drop labels and notes anywhere on the canvas.
- **Pen / freedraw** — sketch by hand, ideal with a stylus.
- **Eraser** — wipe strokes you don't want.

Plus the usual shape, arrow, and selection tools.

## Background colour

Each canvas page has its own background colour. The picker is part of the page chrome. The chosen colour persists and is reloaded the next time you open the page.

## Stylus support

Notemage detects pointer events from non-Apple stylus devices (Wacom, Surface Pen, Samsung S Pen) and **maps the barrel button to eraser mode**. Press the barrel button while you stroke and you erase instead of draw — exactly the muscle memory you're already used to.

> **Apple Pencil note:** Apple Pencil's double-tap and squeeze gestures are not exposed to web pages, so they don't work in the browser. Apple Pencil drawing itself works fine — just no shortcut buttons. Native-app gesture support is on the roadmap.

For the device-by-device matrix and the debug procedure, the engineering reference lives at `quizzard/docs/stylus-support.md` in the repo.

## What gets saved

Notemage persists the **scene elements** and the **background colour** — that is, the actual content of your drawing. It does not persist ephemeral state like the current zoom, the current selection, or which tool you have active. So if you close a page and come back, your art is intact, but the canvas is freshly framed.

Saves are debounced (about every two seconds while you're working), so you can stroke continuously without it hitting the network on every line.

## Embedding files and images

You can drag images and files into the canvas. They become part of the scene and save with the rest of the drawing.

## Where canvas fits in

- Use a **text page** for structured notes you'll want Scholar Chat to read or AI to flashcard from.
- Use a **canvas page** for visual material — proofs, diagrams, hand-drawn equations, free-form brainstorming.

You can mix both kinds of pages inside one notebook.
