export type TutorialStep =
  | 'idle'
  | 'welcome'
  // App-orientation tour (active route-stepping). Header tools first
  // (all on /dashboard), then the source material + Learn-hub surfaces.
  | 'nav-menu'
  | 'search'
  | 'timer'
  | 'profile'
  // Desktop-only — skipped on phone (see getTourSteps / profile.next).
  | 'notebooks'
  | 'learn-tabs'
  | 'learn-paths'
  | 'learn-community'
  | 'learn-chats'
  // Legacy action-driven steps — kept inert so the notebooks-page wiring that
  // references them still type-checks. The new tour never enters these (see
  // steps.ts / TutorialProvider.start).
  | 'step-1-dashboard'
  | 'step-2-notebook-form'
  | 'step-3-workspace'
  | 'step-4-chat-modal'
  | 'complete';

export type TutorialTargetKey =
  | 'nav-menu'
  | 'search'
  | 'timer'
  | 'profile'
  | 'notebooks'
  | 'learn-tabs'
  | 'learn-generate-path'
  | 'learn-community'
  | 'learn-new-chat'
  // Legacy anchors (still registered by the notebooks/dashboard pages).
  | 'dashboard-cta'
  | 'notebook-form'
  | 'chat-create'
  | 'chat-modal';

export interface TutorialPersistedState {
  step?: TutorialStep;
  completedAt?: string;
  dismissedAt?: string;
}

export interface TutorialCompletionResult {
  achievements: { badge: string; name: string }[];
  alreadyComplete: boolean;
}

export interface StepConfig {
  title: string;
  body: string;
  targetKey?: TutorialTargetKey;
  /** Path this step is shown on; the provider navigates here on entry. */
  route?: string;
  /** Step the primary button advances to. Omit → finishes the tour. */
  next?: TutorialStep;
  /** Primary button label (default 'Next'). */
  nextLabel?: string;
  renderBackdrop: boolean;
  tooltipPlacement: 'auto' | 'fixed-top-right' | 'fixed-bottom-left';
  /** Phase B — render the FREE "Pro" upsell framing on this step. */
  upsell?: boolean;
}
