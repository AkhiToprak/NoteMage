import type { DefaultSession } from 'next-auth';
import type { DefaultJWT } from 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      username: string;
      avatarUrl?: string;
      onboardingComplete: boolean;
      role: string;
      tier: string;
      scholarName?: string;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id: string;
    username?: string;
    avatarUrl?: string;
    onboardingComplete?: boolean;
    role?: string;
    tier?: string;
    scholarName?: string;
  }
}
