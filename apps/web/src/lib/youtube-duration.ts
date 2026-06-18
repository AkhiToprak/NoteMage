// Client-side YouTube duration reader via the IFrame Player API — the
// no-API-key way to read a video's length in the browser. A hidden 1×1 player
// loads off-screen; onReady → getDuration(). onError (101/150 = embedding
// disabled) rejects so the caller can surface a terse message rather than
// guessing. Servers that ingest the video reconcile any under-report post-hoc,
// so this client value is acceptable by design.
//
// Extracted from VideoImportTab so the Study Pack wizard's video picker and the
// notebook import tab share one implementation.

interface YTPlayer {
  getDuration: () => number;
  destroy: () => void;
}

interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      height?: string | number;
      width?: string | number;
      playerVars?: Record<string, number>;
      events?: {
        onReady?: (e: { target: YTPlayer }) => void;
        onError?: (e: { data: number }) => void;
      };
    },
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<YTNamespace> | null = null;

/** Load (once) and resolve the global YouTube IFrame API namespace. */
export function loadYouTubeApi(): Promise<YTNamespace> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('YT API load timeout')), 10_000);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      clearTimeout(timeout);
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error('YT API missing after ready'));
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('YT API script failed'));
    };
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

/**
 * Read a YouTube video's duration (seconds) via a hidden off-screen player.
 * Rejects on embedding-disabled (101/150) or timeout — the caller decides how
 * to surface that.
 */
export function readYouTubeDuration(videoId: string): Promise<number> {
  return new Promise((resolve, reject) => {
    loadYouTubeApi()
      .then((YT) => {
        const host = document.createElement('div');
        host.style.position = 'fixed';
        host.style.left = '-9999px';
        host.style.top = '0';
        host.style.width = '1px';
        host.style.height = '1px';
        document.body.appendChild(host);

        let settled = false;
        let player: YTPlayer | null = null;
        const finish = (fn: () => void) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          try {
            player?.destroy();
          } catch {
            /* ignore */
          }
          host.remove();
          fn();
        };
        const timeout = setTimeout(
          () => finish(() => reject(new Error('YT duration timeout'))),
          12_000,
        );

        player = new YT.Player(host, {
          videoId,
          height: '1',
          width: '1',
          playerVars: { autoplay: 0, controls: 0 },
          events: {
            onReady: (e) => {
              const d = e.target.getDuration();
              finish(() => resolve(d));
            },
            onError: (e) => finish(() => reject(new Error(`YT error ${e.data}`))),
          },
        });
      })
      .catch(reject);
  });
}
