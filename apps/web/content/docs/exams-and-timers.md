---
title: Exams and timers
description: Exam countdowns and the in-app Pomodoro / countdown / stopwatch widget.
category: Stay on track
order: 61
---

Two related features in one doc, because they live next to each other in the UI: an **exam countdown** that ticks down to a date you care about, and a **timer widget** that helps you actually sit down and work.

## Exams

The exam tracker turns "study for the midterm" into a real countdown. You add an exam, give it a date, and Notemage shows you how many days you have left.

### Adding an exam {#exams}

Create a new exam with:

- **Title** — e.g. "Cell Biology midterm".
- **Date** — must be in the future.
- **Notebook** — link the exam to the notebook you're studying out of, so it's easy to jump straight from the countdown into the material.
- **Reminders** (optional) — pre-exam pings.

Exams sort by date, soonest first. Past exams drop off the list automatically.

### Why link a notebook?

Linking a notebook means the exam card becomes a one-click jump into the right material — you don't have to dig through the dashboard to find what you should be studying for _this_ deadline.

## Timer widget

The timer widget is a small floating panel with three modes you can switch between with a tab. State is preserved while you navigate around the app, so the timer keeps running while you read pages, drill flashcards, or chat with Mage.

### Countdown {#countdown}

Set a target time in hours and minutes, hit start, and it counts down. Useful for fixed-length study blocks ("read for 45 minutes, then break").

### Pomodoro {#pomodoro}

The classic Pomodoro technique built in. You set:

- **Work duration** — how long each focus block lasts.
- **Break duration** — how long your breaks are.

The widget cycles work → break → work → break and tracks how many sessions you've completed in the current sitting. A progress ring shows where you are in the current phase, and there's a clear visual difference between work and break states so you don't have to read the label.

### Stopwatch {#stopwatch}

Just a stopwatch — start, pause, reset. Use it when you don't know in advance how long a task will take and you just want to know what it cost you when you're done.

## How they work together

A common loop:

1. Add the exam date — see the countdown shrinking on your dashboard.
2. Open the linked notebook — it's one click away from the exam card.
3. Hit Pomodoro — pick 25/5 or whatever rhythm works for you.
4. Study, take the break, repeat.

The XP system ([XP, streaks, achievements](/docs/xp-streaks-achievements)) is rewarding the actions you take during those Pomodoros, so the streak takes care of itself if you keep showing up.
