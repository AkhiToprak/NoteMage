import { describe, expect, it } from 'vitest';
import { isCredentialsCallbackPath, normalizeAuthPath } from '@/lib/auth-paths';

describe('credentials callback path normalization', () => {
  it.each([
    '/api/auth/callback/credentials',
    '/api/auth/callback/credentials/',
    '/api/auth/callback/credentials////',
  ])('recognizes %s as the protected credentials callback', (pathname) => {
    expect(isCredentialsCallbackPath(pathname)).toBe(true);
  });

  it('does not match adjacent NextAuth actions', () => {
    expect(isCredentialsCallbackPath('/api/auth/signout/')).toBe(false);
    expect(isCredentialsCallbackPath('/api/auth/callback/google')).toBe(false);
  });

  it('keeps the root path intact while trimming repeated trailing slashes', () => {
    expect(normalizeAuthPath('////')).toBe('/');
  });
});
