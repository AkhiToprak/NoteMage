// Which provider runs a free-form (plain-chat) chat turn. Generation turns
// always use Anthropic (forced tool calling) regardless of this — see
// chat-stream.ts. Mirrors the per-feature provider resolvers in
// translation/provider.ts and moderation/model-call.ts, keyed on user tier.

import type { TierKey } from './tiers';

export type ChatProvider = 'anthropic' | 'gemini';

/**
 * FREE → Gemini Flash-Lite (cheap). PRO / admin → Anthropic Haiku.
 *
 * Overrides (read at call time, so a container env flip needs no rebuild):
 * - `CHAT_GEMINI_DISABLED=1` → always Anthropic. Instant rollback lever.
 * - `CHAT_PROVIDER_FREE=anthropic` → keep FREE on Anthropic too.
 */
export function resolveChatProvider(tier: TierKey): ChatProvider {
  if (process.env.CHAT_GEMINI_DISABLED === '1') return 'anthropic';
  if (tier !== 'FREE') return 'anthropic';
  if (process.env.CHAT_PROVIDER_FREE === 'anthropic') return 'anthropic';
  return 'gemini';
}
