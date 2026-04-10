---
title: Study plans
description: AI-generated, multi-phase study schedules built from your notebook materials.
category: Study tools
order: 35
---

A study plan is a structured, multi-phase schedule that the AI generates from the things in your notebook. Each phase has a title, a description, a duration in days, and a list of materials to study during that phase.

## What goes in a plan

Each phase can reference materials by ID:

- **Pages** from the notebook.
- **Flashcard sets** to drill.
- **Quiz sets** to test yourself with.
- **Documents** you've imported.

So a generated plan can say things like:

> **Week 1: Foundations** (5 days)
> Read the cell biology chapter, then drill the "Cell Structures" flashcard set. End the week with the "Cells & Organelles" quiz.

…and the materials it references will be real things that already exist in your notebook.

## Generating a plan

Open Mage Chat in the notebook and ask:

> "Build a 6-week study plan for the midterm using everything I've imported."

Mage Chat picks the `create_study_plan` tool. It looks at your notebook inventory, picks materials it thinks belong in each phase, and writes the plan. The plan opens at **/notebooks/[id]/study-plan/[planId]**.

## Tracking progress

Inside a plan you can mark materials as complete as you work through them, so you can see how far along you are at a glance.

## Limits

AI-generated study plans count against a monthly cap:

- **Free** — 2 AI study plans / month.
- **Plus** — 4 AI study plans / month.
- **Pro** — unlimited.

See [Plans and limits](/docs/plans-and-limits).
