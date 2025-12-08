import { redis } from "bun";

// Connect to your existing Redis instance on port 6380
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6380";

// Keys for Redis
export const REDIS_KEYS = {
  // Global sync state
  LAST_SYNC: "hn:last_sync",
  SYNC_LOCK: "hn:sync_lock",

  // Per-user state
  userLastCheck: (username: string) => `hn:user:${username}:last_check`,
  userItemIds: (username: string) => `hn:user:${username}:item_ids`,

  // Item cache (optional - to avoid re-fetching from HN)
  item: (id: number) => `hn:item:${id}`,
};

// Helper to set sync lock with TTL
export async function acquireSyncLock(ttlSeconds: number = 300): Promise<boolean> {
  try {
    // SET NX = only set if doesn't exist (atomic lock)
    // Using SETNX and EXPIRE as separate commands
    const result = await redis.setnx(REDIS_KEYS.SYNC_LOCK, "1");
    if (result === 1) {
      await redis.expire(REDIS_KEYS.SYNC_LOCK, ttlSeconds);
      return true;
    }
    return false;
  } catch (err) {
    console.error("Failed to acquire sync lock:", err);
    return false;
  }
}

export async function releaseSyncLock(): Promise<void> {
  try {
    await redis.del(REDIS_KEYS.SYNC_LOCK);
  } catch (err) {
    console.error("Failed to release sync lock:", err);
  }
}

export async function testRedisConnection(): Promise<boolean> {
  try {
    const result = await redis.ping();
    return result === "PONG";
  } catch (err) {
    console.error("❌ Redis connection failed:", err);
    return false;
  }
}

export async function getLastGlobalSync(): Promise<number> {
  try {
    const timestamp = await redis.get(REDIS_KEYS.LAST_SYNC);
    const value = timestamp ? parseInt(timestamp) : 0;
    console.log(`📖 Redis read: LAST_SYNC = ${value}`);
    return value;
  } catch (err) {
    console.error("❌ Failed to get last sync:", err);
    return 0;
  }
}

export async function setLastGlobalSync(timestamp: number): Promise<void> {
  try {
    await redis.set(REDIS_KEYS.LAST_SYNC, timestamp.toString());
    console.log(`📝 Redis write: LAST_SYNC = ${timestamp}`);
  } catch (err) {
    console.error("❌ Failed to set last sync:", err);
  }
}

export { redis };
