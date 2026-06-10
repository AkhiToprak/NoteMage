// Path-publishing & community-library shared types (Phase 1).
//
// These DTOs are the on-the-wire shape of `SharedPath` and its
// translations, ratings, and moderation audits. They are deliberately
// JSON-friendly (no Date objects — ISO-8601 strings everywhere) so that
// both the web app and the mobile/desktop shells can consume the same
// endpoints without per-platform adapters.
//
// Keep this file dependency-free — it must import cleanly into both a
// React Native runtime and a Next.js (server + browser) bundle.

// Moderation state machine on `SharedPath`. Mirrors the string column
// values written by the moderation pipeline (P3/P4/P5/P7).
export type SharedPathModerationStatus =
  | 'pending'
  | 'auditing_l2'
  | 'auditing_l3'
  | 'flagged_pending_human'
  | 'approved'
  | 'rejected';

// Moderation layers in the audit log. Layer 4 is reserved for the
// deferred reports / trust-scoring phase (P13).
export type ModerationLayer = 1 | 2 | 3 | 5;

// Per-layer verdict ranges. Kept open as a flat union so consumers can
// switch on the literal without re-declaring the per-layer carve-out.
export type ModerationVerdict =
  | 'pass'
  | 'reject'
  | 'flag'
  | 'auto_reject'
  | 'escalate_to_human';

// Translation row lifecycle. The row's existence is the single-flight
// lock; `status` is observable progress for clients that poll.
export type PathTranslationStatus = 'translating' | 'ready' | 'failed';

export interface SharedPathAuthor {
  id: string;
  username: string;
  avatarUrl: string | null;
}

// Slim row returned by the list endpoint (`GET /api/community/paths`).
// Rating aggregates come straight from the denormalized columns; no
// per-row aggregation. Matches P0 spec §4.4.
export interface SharedPathListItem {
  shareId: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  language: string;
  subjects: string[];
  phaseCount: number;
  slotCount: number;
  downloadCount: number;
  viewCount: number;
  ratingAverage: number | null;
  ratingCount: number;
  seeded: boolean;
  approvedAt: string | null; // ISO-8601
  author: SharedPathAuthor;
}

// Full payload for the detail surface. Includes the moderation status so
// the author's "my publications" view can render the chip without a
// second round-trip. Public consumers will only ever see `approved`.
export interface SharedPathDetail extends SharedPathListItem {
  moderationStatus: SharedPathModerationStatus;
  rejectionReason: string | null;
  popularityTriggeredAt: string | null;
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

// Summary of one moderation-audit row exposed to authors on their own
// path's publication-status page. Full audit chain (including model
// reasoning) is admin-only.
export interface ModerationAuditSummary {
  layer: ModerationLayer;
  verdict: ModerationVerdict;
  reasonCode: string | null;
  createdAt: string; // ISO-8601
}

// Response shape of `GET /api/learn/paths/[planId]/publication-status`.
export interface PublicationStatusDTO {
  shareId: string;
  moderationStatus: SharedPathModerationStatus;
  rejectionReason: string | null;
  lastAuditAt: string | null; // ISO-8601
  audits: ModerationAuditSummary[];
}

// Translation overlay returned by `GET /api/community/paths/[shareId]?lang=`.
// `status='ready'` carries the translated payload; `translating` is the
// signal to poll; `failed` carries the error.
export type PathTranslationOverlay =
  | { status: 'translating' }
  | {
      status: 'ready';
      language: string;
      title: string;
      description: string | null;
      // Translated phases/slots/activities/theory/flashcards/quizzes —
      // the full translatable surface. Shape mirrors the source side
      // and will be tightened in P10 once the translation prompt
      // specifies it.
      payload: unknown;
    }
  | { status: 'failed'; error: string };

// Full detail response. `userRating` is the requester's own rating
// (1..5 integer, or null if they haven't rated) — only the detail
// endpoint computes it; list views deliberately don't.
export interface CommunityPathDetailResponse {
  shareId: string;
  language: string;
  source: SharedPathDetail;
  translation?: PathTranslationOverlay;
  userRating: number | null;
}

// Ticket types — v1 ships only `moderation_review`. Kept as a union so
// future ticket types slot in without a breaking change.
export type TicketType = 'moderation_review';

export type TicketStatus = 'open' | 'assigned' | 'resolved' | 'dismissed';

// Admin-side rejection reason taxonomy (mirrors §3.3 reasonCode shape).
// Re-exported so the admin client + tests can refer to the same union.
export type ModerationCategory =
  | 'adult'
  | 'hateful'
  | 'spam'
  | 'offtopic'
  | 'low_quality'
  | 'copyright'
  | 'other';
