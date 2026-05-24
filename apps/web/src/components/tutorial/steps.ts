import type { StepConfig, TutorialStep } from './types';

// The first-run tour orients a new user to the post-restructure app: notebooks
// are the source material, the /learn hub is where studying happens. It's tier
// -aware — FREE users see locked Pro capabilities framed as upsell rather than
// dead ends (see the `upsell` flag + the completion recap). The provider drives
// `router.push` to each step's `route`; the overlay spotlights `targetKey`.

/** Ordered tour steps — drives the tooltip's progress dots. */
export const TOUR_STEPS: readonly TutorialStep[] = [
  'nav-menu',
  'learn-tabs',
  'learn-paths',
  'learn-chats',
];

const HUB_BODY_PRO =
  'Paths, Flashcards, Quizzes, and Chats — switch any time. Each one is built from your notebooks.';
const HUB_BODY_FREE =
  'Flashcards, Quizzes, and Chats — switch any time. Each one is built from your notebooks.';

/**
 * Resolve the config for a tour step. Returns `undefined` for `idle`,
 * `welcome`, `complete`, and the legacy steps (those render their own
 * surfaces or are inert). `isPro` selects the FREE-vs-PRO copy/upsell.
 */
export function getStepConfig(step: TutorialStep, isPro: boolean): StepConfig | undefined {
  switch (step) {
    case 'nav-menu':
      return {
        title: 'Find your way around',
        body: 'Your notebooks, the Learn hub, and settings all live in this menu — tap it any time to get around.',
        targetKey: 'nav-menu',
        route: '/dashboard',
        next: 'learn-tabs',
        nextLabel: 'Show me the Learn hub',
        renderBackdrop: true,
        tooltipPlacement: 'auto',
      };
    case 'learn-tabs':
      return {
        title: 'Switch between tools',
        body: isPro ? HUB_BODY_PRO : HUB_BODY_FREE,
        targetKey: 'learn-tabs',
        route: '/learn/paths',
        next: 'learn-paths',
        renderBackdrop: true,
        tooltipPlacement: 'auto',
      };
    case 'learn-paths':
      return isPro
        ? {
            title: 'Build a study path',
            body: 'Turn any notebook into a Duolingo-style path — bite-size theory, flashcards, and quizzes, in order.',
            targetKey: 'learn-generate-path',
            route: '/learn/paths',
            next: 'learn-chats',
            renderBackdrop: true,
            tooltipPlacement: 'auto',
          }
        : {
            title: 'Study paths',
            body: 'Auto-generated study paths are a Pro feature. On Free you can still explore Community paths here — upgrade any time to generate your own.',
            targetKey: 'learn-generate-path',
            route: '/learn/paths',
            next: 'learn-chats',
            renderBackdrop: true,
            tooltipPlacement: 'auto',
            upsell: true,
          };
    case 'learn-chats':
      return {
        title: 'Ask the Mage',
        body: isPro
          ? 'Chat with the Mage across all your notebooks — ask questions and get explanations, as much as you want.'
          : 'Chat with the Mage across your notebooks — ask questions and get explanations. Free includes 50 messages to start.',
        targetKey: 'learn-new-chat',
        route: '/learn/chats',
        nextLabel: 'Finish',
        renderBackdrop: true,
        tooltipPlacement: 'auto',
      };
    default:
      return undefined;
  }
}
