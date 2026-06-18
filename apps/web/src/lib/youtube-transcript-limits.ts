// Anti-abuse ceiling on a single transcribed YouTube video.
//
// The `youtube_transcript` meter is now charged in MINUTES of video (see
// tiers.ts). A minutes budget already makes long videos cost proportionally,
// but a single absurdly long video (a 10-hour livestream) still shouldn't be
// transcribable in one go — so a per-video hard cap backs up the budget.
//
// Tune freely — this is a sanity ceiling, not a pricing lever.
export const YOUTUBE_TRANSCRIPT_MAX_DURATION_SEC = 4 * 60 * 60; // 4 hours
