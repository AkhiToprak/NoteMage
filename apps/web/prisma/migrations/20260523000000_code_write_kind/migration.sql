-- Phase 10.9 — `code_write` question kind.
-- Server-graded coding exercises where the learner writes code in an
-- editor and the backend runs it on a self-hosted Piston instance
-- against declared test cases.

ALTER TYPE "QuestionKind" ADD VALUE IF NOT EXISTS 'code_write';
