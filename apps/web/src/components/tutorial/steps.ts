import type { StepConfig, TutorialStep } from './types';

export const STEP_CONFIG: Partial<Record<TutorialStep, StepConfig>> = {
  'step-1-dashboard': {
    title: 'Make your first notebook',
    body: 'Notebooks hold your notes, AI chats, and quizzes. Start one here.',
    targetKey: 'dashboard-cta',
    renderBackdrop: true,
    tooltipPlacement: 'auto',
  },
  'step-2-notebook-form': {
    title: 'Name your notebook',
    body: 'Pick a name and subject — both are easy to change later. Hit Create to continue.',
    renderBackdrop: false,
    tooltipPlacement: 'fixed-top-right',
  },
  // Phase 9.5 removed the in-notebook "New chat" sidebar button (the
  // `chat-create` anchor). The `step-3-workspace` entry that pointed at
  // that anchor is gone with it; the overlay simply skips any step that
  // has no config. `step-4-chat-modal` stays for users mid-flow when the
  // ?new=1 entry path fires (still reachable from header affordances).
  'step-4-chat-modal': {
    title: 'Set up the chat',
    body: 'Name is optional. Pick any pages or files you want the AI to see, then hit Start Chat.',
    targetKey: 'chat-modal',
    renderBackdrop: false,
    tooltipPlacement: 'fixed-bottom-left',
  },
};
