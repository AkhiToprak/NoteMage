// Guardrail G3 — pre-Zod shape normalization for model-emitted DocModel blocks.
//
// The strict `docModelSchema` requires a table cell to be a BARE array of inline
// runs: `rows: InlineRun[][][]` (rows → cells → runs). Flash-Lite (the PDF
// engine) frequently drifts the cell shape:
//   - wraps it:        { "runs": [ {text} ] }
//   - paragraph-wraps: { "type": "paragraph", "runs": [ {text} ] }
//   - bare string:     "Cell text"
//   - single run:      { "text": "Cell text" }
//   - row-wraps:       { "cells": [ … ] }
// Each of these fails the strict schema and loses the whole table to the
// heuristic fallback. This step coerces every cell back to `InlineRun[]` (and
// tidies stray run keys) BEFORE validation, so well-meaning drift parses instead
// of failing. It only touches `table` blocks; everything else passes through.

import type { InlineRun } from './doc-model';

const BOOL_RUN_KEYS = ['bold', 'italic', 'underline', 'strike', 'code'] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Whitelist a run object to the strict schema's keys, dropping stray ones
 *  (e.g. a `type:"text"` the model adds) and type-mismatched flags. */
function cleanRun(obj: Record<string, unknown>): InlineRun {
  const run: InlineRun = { text: typeof obj.text === 'string' ? obj.text : '' };
  for (const key of BOOL_RUN_KEYS) {
    if (typeof obj[key] === 'boolean') run[key] = obj[key] as boolean;
  }
  if (typeof obj.link === 'string') run.link = obj.link;
  return run;
}

/** Recursively flatten any cell shape into a flat list of inline runs. */
function collectRuns(node: unknown, out: InlineRun[]): void {
  if (node == null) return;
  if (typeof node === 'string') {
    if (node.length > 0) out.push({ text: node });
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectRuns(child, out);
    return;
  }
  if (isObject(node)) {
    if (Array.isArray(node.runs)) {
      collectRuns(node.runs, out);
      return;
    }
    if (Array.isArray(node.content)) {
      collectRuns(node.content, out);
      return;
    }
    if (typeof node.text === 'string') {
      out.push(cleanRun(node));
      return;
    }
  }
  // Unknown shape → drop it (the strict schema would have rejected it anyway).
}

/** Coerce one table cell of any drifted shape into a bare `InlineRun[]`. */
export function normalizeTableCell(cell: unknown): InlineRun[] {
  const runs: InlineRun[] = [];
  collectRuns(cell, runs);
  return runs;
}

/** Coerce a single `table` block in place: rows → cells → bare run arrays, and
 *  a defaulted `headerRow` when the model omitted it. */
function normalizeTableBlock(block: Record<string, unknown>): void {
  let rows: unknown = block.rows;
  // Some outputs wrap rows under {rows:{rows:[…]}} or give a single row object.
  if (isObject(rows) && Array.isArray((rows as Record<string, unknown>).rows)) {
    rows = (rows as Record<string, unknown>).rows;
  }
  if (!Array.isArray(rows)) {
    block.rows = [];
    if (typeof block.headerRow !== 'boolean') block.headerRow = false;
    return;
  }

  block.rows = rows.map((row) => {
    let cells: unknown = row;
    if (isObject(row) && Array.isArray((row as Record<string, unknown>).cells)) {
      cells = (row as Record<string, unknown>).cells;
    }
    if (!Array.isArray(cells)) {
      // A whole row given as a single value → treat it as one cell.
      return [normalizeTableCell(cells)];
    }
    return cells.map(normalizeTableCell);
  });

  if (typeof block.headerRow !== 'boolean') {
    // Most extracted tables lead with a header; default true only for multi-row
    // tables so a single-row table isn't mislabeled.
    block.headerRow = (block.rows as unknown[]).length > 1;
  }
}

/**
 * Normalize drifted shapes in a parsed DocModel (or bare block array) BEFORE Zod
 * validation. Mutates in place and returns the same reference. Currently fixes
 * table cells; safe to extend with other block normalizers.
 */
export function normalizeDocModelShape(raw: unknown): unknown {
  const blocks = Array.isArray(raw)
    ? raw
    : isObject(raw) && Array.isArray(raw.blocks)
      ? raw.blocks
      : null;
  if (!blocks) return raw;

  for (const block of blocks) {
    if (isObject(block) && block.type === 'table') {
      normalizeTableBlock(block);
    }
  }
  return raw;
}
