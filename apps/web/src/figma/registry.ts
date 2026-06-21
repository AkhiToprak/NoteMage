/**
 * Figma Design Build — screen registry (the backbone).
 *
 * One ordered entry per screen. Each entry carries the Figma node id(s) it is
 * reproduced from (mobile = 393, web = 1440) plus lazy component loaders that
 * resolve to the built screen. In Phase 0 the loaders are all `undefined`
 * (nothing is built yet); a screen build (Phases 1–8) fills in `mobile` / `web`
 * with `() => import('../<flow>/<Screen>.<size>')`.
 *
 * This module is a PLAIN module (no 'use client') so both the server gallery
 * page and the client screen view can import it for metadata. The loaders are
 * only *invoked* on the client (via React.lazy in ResponsiveScreen), so the
 * server never pulls a screen's `'use client'` module into its bundle.
 *
 * Drives: the `/figma` gallery, the `[...slug]` dynamic route, Next/Back within
 * a flow, and the build checklist. Node IDs come from `plans/figma-design-build.md`.
 */
import type { ComponentType } from 'react';

export type FigmaFlow =
  | 'onboarding'
  | 'marketing'
  | 'app-shell'
  | 'path-detail'
  | 'theory-quiz'
  | 'exam-base'
  | 'exam-x2'
  | 'empty-states';

/** A lazy loader for a built screen component (self-contained, no props). */
export type ScreenLoader = () => Promise<{ default: ComponentType }>;

export interface FigmaScreen {
  /** URL slug under /figma, unique, may contain '/'. */
  slug: string;
  flow: FigmaFlow;
  title: string;
  /** Figma node id for the mobile (393px) frame, if one exists. */
  nodeMobile?: string;
  /** Figma node id for the web (1440px) frame, if one exists. */
  nodeWeb?: string;
  /** Extra Figma node ids (alt interaction-states) captured for the build. */
  nodeExtra?: string;
  /** One-line note on the key interaction (from the plan). */
  note?: string;
  /** Lazy loader for the built mobile component (undefined until built). */
  mobile?: ScreenLoader;
  /** Lazy loader for the built web component (undefined until built). */
  web?: ScreenLoader;
}

export interface FigmaFlowMeta {
  id: FigmaFlow;
  label: string;
  /** Short description shown in the gallery. */
  blurb: string;
}

/** Ordered flow metadata — also defines the gallery section order. */
export const FLOWS: readonly FigmaFlowMeta[] = [
  { id: 'onboarding', label: 'Onboarding', blurb: 'Welcome → Source → Sample → Goal → Intensity → Generate → Path → Study → Quiz → Signup' },
  { id: 'marketing', label: 'Marketing / public', blurb: 'Landing, link/upload bridges, pricing, about, docs, login (web-only in Figma)' },
  { id: 'app-shell', label: 'App shell', blurb: 'Dashboard, profile, learning paths list' },
  { id: 'path-detail', label: 'Path & node detail', blurb: 'Learning-path trail and node overview' },
  { id: 'theory-quiz', label: 'Theory + Quiz engine', blurb: 'Theory reader + all 8 quiz types + Ask Mage + Source viewers' },
  { id: 'exam-base', label: 'Exam Mode — base', blurb: 'Wizard: Exams → Basic Info → Format → Upload → Loading → Review → Plan → Dashboard' },
  { id: 'exam-x2', label: 'Exam Mode — X2', blurb: 'Paths, missions, mock exams, calendar, weaknesses, results & reflection' },
  { id: 'empty-states', label: 'Empty states', blurb: 'Eight mobile empty states (render at all widths)' },
] as const;

/**
 * The ordered screen list. Array order = walk order within a flow (Next/Back).
 * Nothing is built in Phase 0 — `mobile` / `web` loaders are added per screen
 * during Phases 1–8.
 */
export const SCREENS: readonly FigmaScreen[] = [
  // ── Phase 1 · Onboarding (13 pairs · 26 frames) ───────────────────────────
  { slug: 'onboarding/01-welcome', flow: 'onboarding', title: '01 Welcome', nodeMobile: '1:17', nodeWeb: '48:2', note: 'CTA → 02', mobile: () => import('./onboarding/Welcome.mobile'), web: () => import('./onboarding/Welcome.web') },
  { slug: 'onboarding/02-source', flow: 'onboarding', title: '02 Source', nodeMobile: '1:19', nodeWeb: '48:4', note: 'pick source type → 03', mobile: () => import('./onboarding/Source.mobile'), web: () => import('./onboarding/Source.web') },
  { slug: 'onboarding/03-sample', flow: 'onboarding', title: '03 Sample', nodeMobile: '1:21', nodeWeb: '48:6', note: 'select sample → 04', mobile: () => import('./onboarding/Sample.mobile'), web: () => import('./onboarding/Sample.web') },
  { slug: 'onboarding/04-goal', flow: 'onboarding', title: '04 Goal', nodeMobile: '1:23', nodeWeb: '48:8', note: 'choose goal → 05', mobile: () => import('./onboarding/Goal.mobile'), web: () => import('./onboarding/Goal.web') },
  { slug: 'onboarding/05-intensity', flow: 'onboarding', title: '05 Intensity', nodeMobile: '1:25', nodeWeb: '48:10', note: 'pick intensity → 06', mobile: () => import('./onboarding/Intensity.mobile'), web: () => import('./onboarding/Intensity.web') },
  { slug: 'onboarding/06-generating', flow: 'onboarding', title: '06 Generating', nodeMobile: '1:27', nodeWeb: '48:12', note: 'animate, auto-advance → 07', mobile: () => import('./onboarding/Generating.mobile'), web: () => import('./onboarding/Generating.web') },
  { slug: 'onboarding/07-path-reveal', flow: 'onboarding', title: '07 Path reveal', nodeMobile: '1:29', nodeWeb: '48:14', note: 'scroll path → 08', mobile: () => import('./onboarding/PathReveal.mobile'), web: () => import('./onboarding/PathReveal.web') },
  { slug: 'onboarding/08-study-session', flow: 'onboarding', title: '08 Study session', nodeMobile: '1:31', nodeWeb: '48:16', note: 'continue → 09', mobile: () => import('./onboarding/StudySession.mobile'), web: () => import('./onboarding/StudySession.web') },
  { slug: 'onboarding/09-quiz', flow: 'onboarding', title: '09 Quiz', nodeMobile: '1:33', nodeWeb: '48:18', note: 'answer → 10', mobile: () => import('./onboarding/Quiz.mobile'), web: () => import('./onboarding/Quiz.web') },
  { slug: 'onboarding/10-feedback', flow: 'onboarding', title: '10 Feedback', nodeMobile: '1:35', nodeWeb: '48:20', note: 'correct/incorrect feedback', mobile: () => import('./onboarding/Feedback.mobile'), web: () => import('./onboarding/Feedback.web') },
  { slug: 'onboarding/10b-feedback', flow: 'onboarding', title: '10b Feedback (alt)', nodeMobile: '27:34', nodeWeb: '48:22', note: 'alt feedback state', mobile: () => import('./onboarding/FeedbackAlt.mobile'), web: () => import('./onboarding/FeedbackAlt.web') },
  { slug: 'onboarding/11-weak-point', flow: 'onboarding', title: '11 Weak point', nodeMobile: '1:37', nodeWeb: '48:24', note: 'review CTA → 12', mobile: () => import('./onboarding/WeakPoint.mobile'), web: () => import('./onboarding/WeakPoint.web') },
  { slug: 'onboarding/12-signup', flow: 'onboarding', title: '12 Signup', nodeMobile: '1:39', nodeWeb: '48:26', note: 'form (no submit), finish', mobile: () => import('./onboarding/Signup.mobile'), web: () => import('./onboarding/Signup.web') },

  // ── Phase 2 · Marketing / public (7 web-only) ─────────────────────────────
  { slug: 'marketing/landing', flow: 'marketing', title: 'LP Landing', nodeWeb: '62:2', note: '1440×4080 long-scroll trail landing', mobile: () => import('./marketing/Landing.mobile'), web: () => import('./marketing/Landing.web') },
  { slug: 'marketing/link-bridge', flow: 'marketing', title: 'B1 Link bridge', nodeWeb: '62:4', note: 'paste-a-link entry', mobile: () => import('./marketing/LinkBridge.mobile'), web: () => import('./marketing/LinkBridge.web') },
  { slug: 'marketing/upload-bridge', flow: 'marketing', title: 'B2 Upload bridge', nodeWeb: '62:6', note: 'upload entry', mobile: () => import('./marketing/UploadBridge.mobile'), web: () => import('./marketing/UploadBridge.web') },
  { slug: 'marketing/pricing', flow: 'marketing', title: 'Pricing', nodeWeb: '72:2', note: '1440×2568', mobile: () => import('./marketing/Pricing.mobile'), web: () => import('./marketing/Pricing.web') },
  { slug: 'marketing/about', flow: 'marketing', title: 'About', nodeWeb: '72:4', note: '1440×1747', mobile: () => import('./marketing/About.mobile'), web: () => import('./marketing/About.web') },
  { slug: 'marketing/docs', flow: 'marketing', title: 'Docs', nodeWeb: '72:6', note: '1440×1100', mobile: () => import('./marketing/Docs.mobile'), web: () => import('./marketing/Docs.web') },
  { slug: 'marketing/login', flow: 'marketing', title: 'Login', nodeWeb: '72:8', note: 'form, no auth', mobile: () => import('./marketing/Login.mobile'), web: () => import('./marketing/Login.web') },

  // ── Phase 3 · App shell (3 pairs · 6 frames) ──────────────────────────────
  { slug: 'app-shell/dashboard', flow: 'app-shell', title: 'Dashboard', nodeMobile: '94:3', nodeWeb: '93:3', note: 'tabs/cards, BottomNav' },
  { slug: 'app-shell/profile', flow: 'app-shell', title: 'Profile', nodeMobile: '97:3', nodeWeb: '96:3', note: 'settings toggles (local)' },
  { slug: 'app-shell/learning-paths', flow: 'app-shell', title: 'Learning paths', nodeMobile: '100:3', nodeWeb: '99:3', note: 'list → path detail' },

  // ── Phase 4 · Path & node detail (2 pairs · 4 frames) ─────────────────────
  { slug: 'path-detail/learning-path', flow: 'path-detail', title: 'Learning path', nodeMobile: '171:2', nodeWeb: '161:2', note: 'scroll trail, tap node → node overview' },
  { slug: 'path-detail/node-overview', flow: 'path-detail', title: 'Node overview', nodeMobile: '179:2', nodeWeb: '186:2', note: 'open theory/quiz' },

  // ── Phase 5 · Theory + Quiz engine (23 frames) ────────────────────────────
  // Phase-5 table is Desktop | Mobile → nodeWeb = desktop, nodeMobile = mobile.
  { slug: 'theory-quiz/theory', flow: 'theory-quiz', title: 'T · Theory', nodeWeb: '187:2', nodeMobile: '192:2', note: 'scroll, "got it" → quiz' },
  { slug: 'theory-quiz/multiple-choice', flow: 'theory-quiz', title: 'Q · Multiple Choice', nodeWeb: '194:2', nodeMobile: '196:2', nodeExtra: '197:205', note: 'select → correct/incorrect + explanation (web "correct" state 197:205)' },
  { slug: 'theory-quiz/order-steps', flow: 'theory-quiz', title: 'Q · Order the Steps', nodeWeb: '197:2', nodeMobile: '198:2', note: 'drag to reorder' },
  { slug: 'theory-quiz/fill-blank-drag', flow: 'theory-quiz', title: 'Q · Fill the Blank — Drag', nodeWeb: '197:395', nodeMobile: '199:2', note: 'drag tokens into blanks' },
  { slug: 'theory-quiz/fill-blank-type', flow: 'theory-quiz', title: 'Q · Fill the Blank — Type', nodeWeb: '197:1026', nodeMobile: '200:2', note: 'type answer, grade' },
  { slug: 'theory-quiz/match-pairs', flow: 'theory-quiz', title: 'Q · Match Pairs', nodeWeb: '197:589', nodeMobile: '199:291', note: 'tap-to-pair / connect' },
  { slug: 'theory-quiz/coding', flow: 'theory-quiz', title: 'Q · Coding', nodeWeb: '197:797', nodeMobile: '199:450', note: 'code input, run-check (mock)' },
  { slug: 'theory-quiz/calculation', flow: 'theory-quiz', title: 'Q · Calculation', nodeWeb: '197:1226', nodeMobile: '199:154', note: 'numeric entry, grade' },
  { slug: 'theory-quiz/ask-mage-explain', flow: 'theory-quiz', title: 'Q · Ask Mage — Explain', nodeWeb: '209:2', note: 'explanation panel (desktop-only)' },
  { slug: 'theory-quiz/ask-mage-related', flow: 'theory-quiz', title: 'Q · Ask Mage — Related Theory', nodeWeb: '210:2', note: 'related-theory panel (desktop-only)' },
  { slug: 'theory-quiz/ask-mage-chat', flow: 'theory-quiz', title: 'Q · Ask Mage — Chat', nodeMobile: '211:2', note: 'mock chat thread (mobile-only)' },
  { slug: 'theory-quiz/source-biology-notes', flow: 'theory-quiz', title: 'Q · Source — Biology Notes', nodeWeb: '213:2', note: 'source viewer (desktop-only)' },
  { slug: 'theory-quiz/source-teacher-slides', flow: 'theory-quiz', title: 'Q · Source — Teacher Slides', nodeWeb: '214:2', note: 'source viewer (desktop-only)' },
  { slug: 'theory-quiz/source-reader', flow: 'theory-quiz', title: 'Q · Source — Reader', nodeMobile: '215:2', note: 'mobile reader (mobile-only)' },

  // ── Phase 6 · Exam Mode, base (8 pairs · 16 frames) ───────────────────────
  { slug: 'exam-base/01-exams', flow: 'exam-base', title: '01 Exams', nodeMobile: '226:100', nodeWeb: '235:191' },
  { slug: 'exam-base/02-basic-info', flow: 'exam-base', title: '02 Basic Info', nodeMobile: '230:574', nodeWeb: '235:757' },
  { slug: 'exam-base/03-format', flow: 'exam-base', title: '03 Format', nodeMobile: '230:2', nodeWeb: '235:636' },
  { slug: 'exam-base/04-upload-material', flow: 'exam-base', title: '04 Upload Material', nodeMobile: '230:304', nodeWeb: '235:346' },
  { slug: 'exam-base/05-analysis-loading', flow: 'exam-base', title: '05 Analysis Loading', nodeMobile: '230:111', nodeWeb: '235:168' },
  { slug: 'exam-base/06-understanding-review', flow: 'exam-base', title: '06 Understanding Review', nodeMobile: '230:437', nodeWeb: '235:374' },
  { slug: 'exam-base/07-plan-generated', flow: 'exam-base', title: '07 Plan Generated', nodeMobile: '230:185', nodeWeb: '235:2' },
  { slug: 'exam-base/08-dashboard', flow: 'exam-base', title: '08 Basic Exam Dashboard', nodeMobile: '230:773', nodeWeb: '235:772' },

  // ── Phase 7 · Exam Mode, X2 expansion (18 pairs · 36 frames) ──────────────
  { slug: 'exam-x2/exam-paths', flow: 'exam-x2', title: 'Exam Paths', nodeMobile: '248:95', nodeWeb: '248:3228' },
  { slug: 'exam-x2/exam-path-detail', flow: 'exam-x2', title: 'Exam Path (detail)', nodeMobile: '278:306', nodeWeb: '282:255' },
  { slug: 'exam-x2/exam-mission', flow: 'exam-x2', title: 'Exam Mission', nodeMobile: '278:222', nodeWeb: '280:2' },
  { slug: 'exam-x2/exam-quiz', flow: 'exam-x2', title: 'Exam Quiz', nodeMobile: '279:32', nodeWeb: '280:297' },
  { slug: 'exam-x2/exam-quiz-result', flow: 'exam-x2', title: 'Exam Quiz Result', nodeMobile: '280:482', nodeWeb: '283:2' },
  { slug: 'exam-x2/mock-exam-setup', flow: 'exam-x2', title: 'Mock Exam Setup', nodeMobile: '248:1523', nodeWeb: '249:338' },
  { slug: 'exam-x2/mock-exam-taking', flow: 'exam-x2', title: 'Mock Exam Taking', nodeMobile: '248:210', nodeWeb: '249:2' },
  { slug: 'exam-x2/mock-exam-results', flow: 'exam-x2', title: 'Mock Exam Results', nodeMobile: '248:548', nodeWeb: '256:3504' },
  { slug: 'exam-x2/todays-study-plan', flow: 'exam-x2', title: "Today's Study Plan", nodeMobile: '248:369', nodeWeb: '248:2330' },
  { slug: 'exam-x2/study-calendar', flow: 'exam-x2', title: 'Study Calendar', nodeMobile: '248:2559', nodeWeb: '250:480' },
  { slug: 'exam-x2/weaknesses', flow: 'exam-x2', title: 'Weaknesses', nodeMobile: '248:318', nodeWeb: '248:2784' },
  { slug: 'exam-x2/notification-settings', flow: 'exam-x2', title: 'Notification Settings', nodeMobile: '248:799', nodeWeb: '252:2' },
  { slug: 'exam-x2/exam-result-entry', flow: 'exam-x2', title: 'Exam Result Entry', nodeMobile: '267:326', nodeWeb: '267:169' },
  { slug: 'exam-x2/exam-feedback-detail', flow: 'exam-x2', title: 'Exam Feedback Detail', nodeMobile: '267:288', nodeWeb: '269:193' },
  { slug: 'exam-x2/good-result-celebration', flow: 'exam-x2', title: 'Good Result Celebration', nodeMobile: '268:2', nodeWeb: '267:484' },
  { slug: 'exam-x2/bad-result-reflection', flow: 'exam-x2', title: 'Bad Result Reflection', nodeMobile: '267:409', nodeWeb: '267:2' },
  { slug: 'exam-x2/post-exam-archive', flow: 'exam-x2', title: 'Post-Exam Archive', nodeMobile: '267:698', nodeWeb: '267:592' },
  { slug: 'exam-x2/post-exam-learning-report', flow: 'exam-x2', title: 'Post-Exam Learning Report', nodeMobile: '267:769', nodeWeb: '270:2' },

  // ── Phase 8 · Empty states (8 mobile-only) ────────────────────────────────
  { slug: 'empty-states/no-archived-exams', flow: 'empty-states', title: 'No archived exams', nodeMobile: '278:2' },
  { slug: 'empty-states/no-linked-paths', flow: 'empty-states', title: 'No linked paths', nodeMobile: '278:31' },
  { slug: 'empty-states/no-mock-exams', flow: 'empty-states', title: 'No mock exams', nodeMobile: '278:72' },
  { slug: 'empty-states/no-exams', flow: 'empty-states', title: 'No exams', nodeMobile: '278:114' },
  { slug: 'empty-states/no-study-plan', flow: 'empty-states', title: 'No study plan', nodeMobile: '278:155' },
  { slug: 'empty-states/no-material', flow: 'empty-states', title: 'No material', nodeMobile: '278:190' },
  { slug: 'empty-states/no-weak-areas', flow: 'empty-states', title: 'No weak areas', nodeMobile: '278:480' },
  { slug: 'empty-states/no-reminders', flow: 'empty-states', title: 'No reminders', nodeMobile: '278:511' },
] as const;

/** Figma file key + page for the whole build (from the plan). */
export const FIGMA_FILE_KEY = 'DDFpUOARLO01i5J2dMxsUT';
export const FIGMA_PAGE = 'NoteMage Onboarding';

/** Look up a single screen by its slug. */
export function getScreen(slug: string): FigmaScreen | undefined {
  return SCREENS.find((s) => s.slug === slug);
}

/** All screens in a flow, in walk order. */
export function getFlowScreens(flow: FigmaFlow): FigmaScreen[] {
  return SCREENS.filter((s) => s.flow === flow);
}

/** Previous / next screen *within the same flow* (for Next/Back). */
export function getAdjacent(slug: string): { prev?: FigmaScreen; next?: FigmaScreen } {
  const entry = getScreen(slug);
  if (!entry) return {};
  const siblings = getFlowScreens(entry.flow);
  const i = siblings.findIndex((s) => s.slug === slug);
  return { prev: siblings[i - 1], next: siblings[i + 1] };
}

/** True once a screen has at least one built component. */
export function isBuilt(s: FigmaScreen): boolean {
  return Boolean(s.mobile || s.web);
}

/** Count of Figma frames a screen reproduces (mobile + web + alt states). */
export function frameCount(s: FigmaScreen): number {
  return (s.nodeMobile ? 1 : 0) + (s.nodeWeb ? 1 : 0) + (s.nodeExtra ? 1 : 0);
}

/** Total Figma frames across the whole build (acceptance: 126). */
export const TOTAL_FRAMES = SCREENS.reduce((n, s) => n + frameCount(s), 0);
