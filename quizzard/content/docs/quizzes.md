---
title: Quizzes
description: Multiple-choice quiz sets with hints, explanations, and attempt history.
category: Study tools
order: 32
---

Quizzes in Notemage are multiple-choice tests built around your notebook. Every question has four answer choices, one correct answer, an optional hint, and explanations for both correct and wrong answers. Attempts are tracked so you can see whether you're improving.

## Building a quiz

### Manually

From a notebook, create a new quiz set and add questions one at a time. For each question you write:

- The question text.
- Four answer choices.
- The index of the correct one.
- (Optional) a hint to nudge the student.
- (Optional) an explanation that shows when they get it right.
- (Optional) an explanation that shows when they get it wrong.

### With AI

Easier path: open Scholar Chat, attach the page you want to be tested on, and ask:

> "Make a 15-question quiz on this chapter, with hints and explanations for each."

Scholar Chat calls the `create_quiz` tool and writes the questions. You can edit any of them afterwards.

## Taking a quiz

The viewer lives at **/notebooks/[id]/quizzes/[setId]**. You answer one question at a time, see immediate feedback, and at the end you get a score. Each completed run is stored as an **attempt**, so over time you can see whether your scores are climbing.

## Export

Quiz sets export to:

- **PDF** — printable test paper.
- **PowerPoint (.pptx)** — present in front of a class.

## Limits

AI-generated quiz sets count against a monthly cap:

- **Free** — 2 AI-generated quiz sets / month.
- **Plus** — 4 AI-generated quiz sets / month.
- **Pro** — unlimited.

Manually-built quiz sets are unlimited on every plan. See [Plans and limits](/docs/plans-and-limits).
