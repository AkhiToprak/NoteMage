export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');

    // Run the background-job worker IN-PROCESS on the web server so queued jobs
    // (video/PDF/OneNote import, path translate) get drained without a separate
    // worker service. The web container already has DATABASE_URL + GEMINI_API_KEY.
    //   • On by default in production.
    //   • WORKER_IN_PROCESS=1 force-enables (e.g. local dev).
    //   • WORKER_IN_PROCESS=0 disables (e.g. a dedicated `pnpm worker` owns the queue).
    const flag = process.env.WORKER_IN_PROCESS;
    if (flag === '1' || (flag !== '0' && process.env.NODE_ENV === 'production')) {
      const { startInProcessWorker } = await import('@/lib/background-worker');
      startInProcessWorker();
    }
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = async (...args: unknown[]) => {
  const { captureRequestError } = await import('@sentry/nextjs');
  // @ts-expect-error - Sentry's captureRequestError accepts the spread args from Next.js
  return captureRequestError(...args);
};
