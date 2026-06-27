import { createHash, randomUUID } from 'crypto';
import { getRedis } from '@/lib/redis';

const CACHE_ENVELOPE_VERSION = 1;

interface CacheEnvelope<T> {
  v: typeof CACHE_ENVELOPE_VERSION;
  value: T;
}

export function redisConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

function stableStringify(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? String(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

export function stableHash(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

export async function cacheGetOrSet<T>(
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>,
): Promise<T> {
  if (!redisConfigured()) return load();

  try {
    const cached = await getRedis().get<CacheEnvelope<T>>(key);
    if (cached?.v === CACHE_ENVELOPE_VERSION && 'value' in cached) {
      return cached.value;
    }
  } catch (error) {
    console.error(`[redis-cache] read failed for ${key}`, error);
  }

  const value = await load();

  try {
    await getRedis().set(key, { v: CACHE_ENVELOPE_VERSION, value }, { ex: ttlSeconds });
  } catch (error) {
    console.error(`[redis-cache] write failed for ${key}`, error);
  }

  return value;
}

export async function cacheDel(...keys: string[]): Promise<void> {
  if (!redisConfigured() || keys.length === 0) return;

  try {
    await getRedis().del(...keys);
  } catch (error) {
    console.error(`[redis-cache] delete failed for ${keys.join(',')}`, error);
  }
}

export type RedisLock =
  | {
      acquired: true;
      degraded: boolean;
      release: () => Promise<void>;
    }
  | {
      acquired: false;
      retryAfterMs: number;
    };

export async function acquireRedisLock(key: string, ttlSeconds: number): Promise<RedisLock> {
  if (!redisConfigured()) {
    return { acquired: true, degraded: true, release: async () => {} };
  }

  const token = randomUUID();

  try {
    const result = await getRedis().set(key, token, { nx: true, ex: ttlSeconds });
    if (result !== 'OK') {
      return { acquired: false, retryAfterMs: ttlSeconds * 1000 };
    }
  } catch (error) {
    console.error(`[redis-cache] lock failed open for ${key}`, error);
    return { acquired: true, degraded: true, release: async () => {} };
  }

  return {
    acquired: true,
    degraded: false,
    release: async () => {
      try {
        await getRedis().eval<[string], number>(
          'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
          [key],
          [token],
        );
      } catch (error) {
        console.error(`[redis-cache] unlock failed for ${key}`, error);
      }
    },
  };
}
