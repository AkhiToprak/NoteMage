export type TutorialStep =
  | 'idle'
  | 'welcome'
  | 'step-1-dashboard'
  | 'step-2-notebook-form'
  | 'step-3-workspace'
  | 'step-4-chat-modal'
  | 'complete';

export type TutorialTargetKey =
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
  renderBackdrop: boolean;
  tooltipPlacement: 'auto' | 'fixed-top-right' | 'fixed-bottom-left';
}
