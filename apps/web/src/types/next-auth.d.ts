import type { DefaultSession } from 'next-auth';
import type { DefaultJWT } from 'next-auth/jwt';

// Shape stored on User.nameStyle — kept loose here so we don't have to import
// the full cosmetics catalog into the auth typing layer.
export interface NameStyleSession {
  fontId?: string;
  colorId?: string;
}

export interface TutorialStateSession {
  step?: string;
  completedAt?: string;
  dismissedAt?: string;
  seenShowcases?: string[];
}

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      username: string;
      avatarUrl?: string;
      onboardingComplete: boolean;
      /** True once a birth date is on file. Lets onboarding skip the DOB gate. */
      hasBirthDate: boolean;
      role: string;
      tier: string;
      scholarName?: string;
      nameStyle?: NameStyleSession;
      equippedTitleId?: string;
      equippedFrameId?: string;
      equippedBackgroundId?: string;
      tutorialState?: TutorialStateSession;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id: string;
    /** Internal revocation generation. Deliberately never copied to Session. */
    authVersion: number;
    username?: string;
    avatarUrl?: string;
    onboardingComplete?: boolean;
    hasBirthDate?: boolean;
    role?: string;
    tier?: string;
    scholarName?: string;
    nameStyle?: NameStyleSession;
    equippedTitleId?: string;
    equippedFrameId?: string;
    equippedBackgroundId?: string;
    tutorialState?: TutorialStateSession;
  }
}
