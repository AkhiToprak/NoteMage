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
  'step-3-workspace': {
    title: 'Start your first chat',
    body: 'Hit the + to spin up an AI chat grounded in your notes.',
    targetKey: 'chat-create',
    renderBackdrop: true,
    tooltipPlacement: 'auto',
  },
  'step-4-chat-modal': {
    title: 'Set up the chat',
    body: 'Name is optional. Pick any pages or files you want the AI to see, then hit Start Chat.',
    targetKey: 'chat-modal',
    renderBackdrop: false,
    tooltipPlacement: 'fixed-top-right',
  },
};
