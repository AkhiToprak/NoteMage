import type { StepConfig, TutorialStep } from './types';

// The first-run tour orients a new user to the whole app, not just one corner:
// the dashboard, the always-on header tools (menu, search, timer), then the
// surfaces they'll live in — profile, notebooks, the /learn hub, and Co-Work
// (study groups + live sessions). Some steps
// navigate to a dedicated page and spotlight its contents (profile -> /profile,
// notebooks -> /notebooks) rather than just poking at the header. It's
// tier-aware — FREE users see locked Pro capabilities framed as upsell rather
// than dead ends (see the `upsell` flag + the completion recap) — and
// device-aware: the desktop `notebooks` step is dropped on phones, where
// authoring isn't the job (see getTourSteps + the profile step's `next`).
// The provider drives `router.push` to each step's `route`; the overlay
// spotlights `targetKey`.

/**
 * Ordered tour steps for the given device — drives the tooltip's progress dots
 * and must match the `next` chain in getStepConfig. The `notebooks` step is
 * desktop-only: phones study paths/cards, they don't import source PDFs.
 */
export function getTourSteps(isPhone: boolean): TutorialStep[] {
  const steps: TutorialStep[] = ['dashboard', 'nav-menu', 'search', 'timer', 'profile'];
  if (!isPhone) steps.push('notebooks');
  steps.push('learn-tabs', 'learn-paths', 'learn-community', 'learn-chats', 'cowork');
  return steps;
}

const HUB_BODY_PRO =
  'Paths, Flashcards, Quizzes, and Chats — switch any time. Each one is built from your notebooks.';
const HUB_BODY_FREE =
  'Flashcards, Quizzes, and Chats — switch any time. Each one is built from your notebooks.';

/**
 * Resolve the config for a tour step. Returns `undefined` for `idle`,
 * `welcome`, `complete`, and the legacy steps (those render their own
 * surfaces or are inert). `isPro` selects the FREE-vs-PRO copy/upsell;
 * `isPhone` decides whether `profile` advances to `notebooks` (desktop) or
 * skips straight to the Learn hub (phone).
 */
export function getStepConfig(
  step: TutorialStep,
  isPro: boolean,
  isPhone: boolean
): StepConfig | undefined {
  switch (step) {
    case 'dashboard':
      return {
        title: 'This is your dashboard',
        body: 'Your home base — track your streak and study goals, jump back into recent notebooks, and see what to study next.',
        targetKey: 'dashboard',
        route: '/dashboard',
        next: 'nav-menu',
        renderBackdrop: true,
        tooltipPlacement: 'auto',
      };
    case 'nav-menu':
      return {
        title: 'Find your way around',
        body: 'Your notebooks, the Learn hub, and settings all live in this menu — tap it any time to get around.',
        targetKey: 'nav-menu',
        route: '/dashboard',
        next: 'search',
        renderBackdrop: true,
        tooltipPlacement: 'auto',
      };
    case 'search':
      return {
        title: 'Search everything',
        body: 'Find a notebook, a page inside it, or another learner — start typing and matches appear as you go.',
        targetKey: 'search',
        route: '/dashboard',
        next: 'timer',
        renderBackdrop: true,
        tooltipPlacement: 'auto',
      };
    case 'timer':
      return {
        title: 'Time your study',
        body: 'A built-in countdown, Pomodoro, and stopwatch. Start a session and it keeps running while you work.',
        targetKey: 'timer',
        route: '/dashboard',
        next: 'profile',
        renderBackdrop: true,
        tooltipPlacement: 'auto',
      };
    case 'profile':
      return {
        title: 'Your public profile',
        body: "This is your whole profile — bio, appearance, activity, and trophies in one place. Make it yours; it's what others see.",
        targetKey: 'profile',
        route: '/profile',
        next: isPhone ? 'learn-tabs' : 'notebooks',
        renderBackdrop: true,
        // Whole-page spotlight: dock the tooltip in the corner so it doesn't
        // sit on top of the profile it's pointing at.
        tooltipPlacement: 'fixed-bottom-left',
      };
    case 'notebooks':
      return {
        title: 'Your source material',
        body: 'Imported PDFs live here as notebooks. Everything you study — paths, flashcards, quizzes — is generated from them.',
        targetKey: 'notebooks',
        route: '/notebooks',
        next: 'learn-tabs',
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
            body: 'Turn any notebook into a guided path — bite-size theory, flashcards, and quizzes, in order.',
            targetKey: 'learn-generate-path',
            route: '/learn/paths',
            next: 'learn-community',
            renderBackdrop: true,
            tooltipPlacement: 'auto',
          }
        : {
            title: 'Study paths',
            body: 'Auto-generated study paths are a Pro feature. On Free you learn from Community paths instead — coming up next.',
            targetKey: 'learn-generate-path',
            route: '/learn/paths',
            next: 'learn-community',
            renderBackdrop: true,
            tooltipPlacement: 'auto',
            upsell: true,
          };
    case 'learn-community':
      return {
        title: 'Explore community paths',
        body: isPro
          ? 'Browse study paths the community has shared. Clone any to study it, or use it as a starting point for your own.'
          : 'Browse study paths other learners have shared, and clone any to study it as your own — no Pro needed.',
        targetKey: 'learn-community',
        route: '/learn/community',
        next: 'learn-chats',
        renderBackdrop: true,
        tooltipPlacement: 'auto',
      };
    case 'learn-chats':
      return {
        title: 'Ask the Mage',
        body: isPro
          ? 'Chat with the Mage across all your notebooks — ask questions and get explanations, as much as you want.'
          : 'Chat with the Mage across your notebooks — ask questions and get explanations. Free includes 50 messages to start.',
        targetKey: 'learn-new-chat',
        route: '/learn/chats',
        next: 'cowork',
        renderBackdrop: true,
        tooltipPlacement: 'auto',
      };
    case 'cowork':
      return {
        title: 'Study together',
        body: "This is Co-Work — join study groups and classes, message classmates, and run live sessions on a notebook together in real time. You don't have to study alone.",
        targetKey: 'cowork',
        route: '/groups',
        nextLabel: 'Finish',
        renderBackdrop: true,
        tooltipPlacement: 'auto',
      };
    default:
      return undefined;
  }
}
