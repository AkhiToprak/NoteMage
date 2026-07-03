const CREDENTIALS_CALLBACK_PATH = '/api/auth/callback/credentials';

/** NextAuth action paths are canonicalized before security policy matching. */
export function normalizeAuthPath(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, '');
  return normalized || '/';
}

export function isCredentialsCallbackPath(pathname: string): boolean {
  return normalizeAuthPath(pathname) === CREDENTIALS_CALLBACK_PATH;
}
