import { redis } from "@/lib/db/redis";

type CacheEntry = {
  expiresAt: number;
  staleUntil: number;
  value: unknown;
};

type RedisPayload = {
  expiresAt: number;
  staleUntil: number;
  value: unknown;
};

type CachedValue = {
  expiresAt: number;
  stale: boolean;
  staleUntil: number;
  value: unknown;
};

const memoryStore = new Map<string, CacheEntry>();
const inFlightStore = new Map<string, Promise<unknown>>();
const fallbackGenerationStore = new Map<string, number>();
const EXPIRED_ENTRY_SWEEP_INTERVAL = 64;
let localCacheEpoch = 0;
let setsSinceSweep = 0;

const getGenerationKey = (namespace: string) => `cachegen:${namespace}`;

const clearNamespaceEntries = (namespace: string) => {
  for (const key of memoryStore.keys()) {
    if (key.startsWith(`${namespace}:`)) {
      memoryStore.delete(key);
    }
  }

  for (const key of inFlightStore.keys()) {
    if (key.startsWith(`${namespace}:`)) {
      inFlightStore.delete(key);
    }
  }
};

const readMemoryValue = (key: string, allowStale: boolean): CachedValue | null => {
  const cached = memoryStore.get(key);
  if (!cached) {
    return null;
  }

  const now = Date.now();
  if (now < cached.expiresAt) {
    return { stale: false, expiresAt: cached.expiresAt, staleUntil: cached.staleUntil, value: cached.value };
  }

  if (allowStale && now < cached.staleUntil) {
    return { stale: true, expiresAt: cached.expiresAt, staleUntil: cached.staleUntil, value: cached.value };
  }

  memoryStore.delete(key);
  return null;
};

const sweepExpiredMemoryEntries = () => {
  const now = Date.now();
  for (const [key, entry] of memoryStore) {
    if (entry.staleUntil <= now) {
      memoryStore.delete(key);
    }
  }
};

const setCachedMemoryValue = (
  key: string,
  value: unknown,
  expiresAt: number,
  staleUntil: number
) => {
  memoryStore.set(key, { expiresAt, staleUntil, value });

  setsSinceSweep += 1;
  if (setsSinceSweep >= EXPIRED_ENTRY_SWEEP_INTERVAL) {
    setsSinceSweep = 0;
    sweepExpiredMemoryEntries();
  }
};

const getFallbackGeneration = (namespace: string) =>
  fallbackGenerationStore.get(namespace) ?? 0;

const connectRedis = async () => {
  if (!redis) {
    return null;
  }

  await redis.connect().catch(() => undefined);
  return redis;
};

const getGeneration = async (namespace: string): Promise<number> => {
  const client = await connectRedis();
  if (!client) {
    return getFallbackGeneration(namespace);
  }

  try {
    const current = await client.get(getGenerationKey(namespace));
    if (!current) {
      await client.set(getGenerationKey(namespace), "0");
      return 0;
    }

    const parsed = Number.parseInt(current, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return getFallbackGeneration(namespace);
  }
};

const setRedisValue = async (
  key: string,
  value: unknown,
  expiresAt: number,
  staleUntil: number
) => {
  const client = await connectRedis();
  if (!client) {
    return;
  }

  const ttlMs = staleUntil - Date.now();
  if (ttlMs <= 0) {
    return;
  }

  const payload: RedisPayload = { expiresAt, staleUntil, value };
  await client.set(key, JSON.stringify(payload), "PX", ttlMs);
};

const getRedisValue = async <T>(key: string, allowStale: boolean): Promise<CachedValue | null> => {
  const client = await connectRedis();
  if (!client) {
    return null;
  }

  try {
    const raw = await client.get(key);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as RedisPayload;
    const now = Date.now();
    if (now < parsed.expiresAt) {
      return { stale: false, expiresAt: parsed.expiresAt, staleUntil: parsed.staleUntil, value: parsed.value as T };
    }

    if (allowStale && now < parsed.staleUntil) {
      return { stale: true, expiresAt: parsed.expiresAt, staleUntil: parsed.staleUntil, value: parsed.value as T };
    }

    return null;
  } catch {
    return null;
  }
};

export const clearJsonCache = (): void => {
  memoryStore.clear();
  inFlightStore.clear();
  fallbackGenerationStore.clear();
  localCacheEpoch += 1;
  setsSinceSweep = 0;
};

export const __jsonCacheTestUtils = {
  getMemoryStoreSize: (): number => memoryStore.size
};

export const invalidateJsonCacheNamespace = async (namespace: string): Promise<void> => {
  clearNamespaceEntries(namespace);

  const client = await connectRedis();
  if (!client) {
    fallbackGenerationStore.set(namespace, getFallbackGeneration(namespace) + 1);
    return;
  }

  try {
    const nextGeneration = await client.incr(getGenerationKey(namespace));
    fallbackGenerationStore.set(namespace, nextGeneration);
  } catch {
    fallbackGenerationStore.set(namespace, getFallbackGeneration(namespace) + 1);
  }
};

type CacheOptions = {
  staleMs?: number;
};

const loadThroughCache = async <T>(
  namespace: string,
  scope: string,
  ttlMs: number,
  loader: () => Promise<T>,
  options: CacheOptions
): Promise<T> => {
  const staleMs = Math.max(0, options.staleMs ?? 0);
  const generation = await getGeneration(namespace);
  const cacheKey = `${namespace}:e${localCacheEpoch}:g${generation}:${scope}`;
  const inFlightKey = `${namespace}:e${localCacheEpoch}:pending:${scope}`;

  const refresh = () => {
    if (inFlightStore.has(inFlightKey)) {
      return;
    }

    const pending = loader()
      .then(async (resolved) => {
        const refreshedAt = Date.now();
        setCachedMemoryValue(
          cacheKey,
          resolved,
          refreshedAt + ttlMs,
          refreshedAt + ttlMs + staleMs
        );
        await setRedisValue(
          cacheKey,
          resolved,
          refreshedAt + ttlMs,
          refreshedAt + ttlMs + staleMs
        ).catch(() => undefined);
        return resolved;
      })
      .catch(() => undefined)
      .finally(() => {
        inFlightStore.delete(inFlightKey);
      });

    inFlightStore.set(inFlightKey, pending);
  };

  const cachedMemory = readMemoryValue(cacheKey, staleMs > 0);
  if (cachedMemory) {
    if (cachedMemory.stale) {
      refresh();
    }

    return cachedMemory.value as T;
  }

  const cachedRedis = await getRedisValue<T>(cacheKey, staleMs > 0);
  if (cachedRedis) {
    setCachedMemoryValue(
      cacheKey,
      cachedRedis.value,
      cachedRedis.expiresAt,
      cachedRedis.staleUntil
    );
    if (cachedRedis.stale) {
      refresh();
    }

    return cachedRedis.value as T;
  }

  const pending = inFlightStore.get(inFlightKey);
  if (pending) {
    return pending as Promise<T>;
  }

  const nextPending = loader()
    .then(async (resolved) => {
      const loadedAt = Date.now();
      setCachedMemoryValue(cacheKey, resolved, loadedAt + ttlMs, loadedAt + ttlMs + staleMs);
      await setRedisValue(cacheKey, resolved, loadedAt + ttlMs, loadedAt + ttlMs + staleMs)
        .catch(() => undefined);
      return resolved;
    })
    .finally(() => {
      inFlightStore.delete(inFlightKey);
    });

  inFlightStore.set(inFlightKey, nextPending);
  return nextPending;
};

export const fromJsonCacheWithStale = async <T>(
  namespace: string,
  scope: string,
  ttlMs: number,
  staleMs: number,
  loader: () => Promise<T>
): Promise<T> => loadThroughCache(namespace, scope, ttlMs, loader, { staleMs });

export const fromJsonCache = async <T>(
  namespace: string,
  scope: string,
  ttlMs: number,
  loader: () => Promise<T>
): Promise<T> => loadThroughCache(namespace, scope, ttlMs, loader, {});
