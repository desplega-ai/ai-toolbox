import { queries, findThreadRootInDB } from "./db";
import { getMaxItemId, getItem, getUser, type HNItem } from "./hn-api";
import {
  redis,
  REDIS_KEYS,
  acquireSyncLock,
  releaseSyncLock,
  getLastGlobalSync,
  setLastGlobalSync,
  testRedisConnection
} from "./redis";
import { backfillThreadRoots } from "./thread-utils";

const BATCH_SIZE = 100; // Process 100 items at a time
const SYNC_INTERVAL = 60 * 1000; // Sync every 60 seconds
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6380";

interface SyncStats {
  itemsProcessed: number;
  itemsStored: number;
  errors: number;
  duration: number;
}

/**
 * Main sync function - incrementally syncs new HN items
 */
async function syncHackerNews(): Promise<SyncStats> {
  const startTime = Date.now();
  const stats: SyncStats = {
    itemsProcessed: 0,
    itemsStored: 0,
    errors: 0,
    duration: 0,
  };

  try {
    // Acquire lock to prevent concurrent syncs
    const lockAcquired = await acquireSyncLock(300); // 5 min TTL
    if (!lockAcquired) {
      console.log("⏭️  Sync already in progress (lock held), skipping...");
      return stats;
    }

    console.log("🔒 Lock acquired, starting sync");

    // Get max item ID from HN
    const maxItemId = await getMaxItemId();
    const lastSyncedId = await getLastGlobalSync();

    // Start from last synced ID, or go back 1000 items if first sync
    const startId = lastSyncedId || (maxItemId - 1000);

    console.log(`🔄 Syncing from item ${startId + 1} to ${maxItemId} (${maxItemId - startId} items)`);

    // Get all tracked users
    const trackedUsers = queries.getAllTrackedUsers.all({});
    const userMap = new Map(trackedUsers.map(u => [u.username, u]));

    console.log(`👥 Tracking ${trackedUsers.length} users: ${trackedUsers.map(u => u.username).join(', ')}`);

    // Process items in batches
    for (let id = startId + 1; id <= maxItemId; id += BATCH_SIZE) {
      const endId = Math.min(id + BATCH_SIZE - 1, maxItemId);

      // Fetch batch concurrently
      const itemPromises = [];
      for (let itemId = id; itemId <= endId; itemId++) {
        itemPromises.push(
          getItem(itemId).catch(err => {
            stats.errors++;
            console.error(`Failed to fetch item ${itemId}:`, err.message);
            return null;
          })
        );
      }

      const items = await Promise.all(itemPromises);
      const validItems = items.filter(i => i !== null);
      stats.itemsProcessed += validItems.length;

      // Filter and store items from tracked users
      let itemsFromTrackedUsers = 0;
      for (const item of items) {
        if (!item) continue;

        // Check if this item is from a tracked user
        if (userMap.has(item.by)) {
          itemsFromTrackedUsers++;
          try {
            const now = Math.floor(Date.now() / 1000);

            // Compute thread root (DB-only, no HN API calls)
            const threadRootId = findThreadRootInDB(item.id);

            queries.insertItem.run({
              $id: item.id,
              $username: item.by,
              $type: item.type,
              $by: item.by,
              $time: item.time,
              $title: (item as any).title || null,
              $text: (item as any).text || null,
              $url: (item as any).url || null,
              $score: (item as any).score || null,
              $parent: (item as any).parent || null,
              $descendants: (item as any).descendants || null,
              $fetched_at: now,
              $last_comment_count: (item as any).descendants || 0,
              $thread_root_id: threadRootId,
              $parent_fetched: threadRootId !== null ? 1 : 0, // If we found root in DB, parent is "fetched"
            });
            stats.itemsStored++;
          } catch (err) {
            stats.errors++;
            console.error(`❌ Failed to store item ${item.id}:`, err);
            console.error(`   Item details: type=${item.type}, by=${item.by}, parent=${(item as any).parent || 'none'}`);
          }
        }
      }

      // Update progress
      await setLastGlobalSync(endId);
      console.log(`📦 Batch ${id}-${endId}: ${validItems.length} valid items, ${itemsFromTrackedUsers} from tracked users, ${stats.itemsStored} stored total`);
    }

    console.log(`✅ Sync complete: processed ${stats.itemsProcessed} items, stored ${stats.itemsStored} new items, ${stats.errors} errors`);

  } catch (error) {
    console.error("❌ Sync error:", error);
    stats.errors++;
  } finally {
    await releaseSyncLock();
    stats.duration = Date.now() - startTime;
    console.log(`⏱️  Sync took ${Math.round(stats.duration / 1000)}s`);
  }

  return stats;
}

/**
 * Also sync existing items for comment count updates
 */
async function updateExistingItems(): Promise<void> {
  console.log("Checking for comment count updates...");

  const trackedUsers = queries.getAllTrackedUsers.all({});

  for (const user of trackedUsers) {
    try {
      // Get user's recent items from DB
      const items = queries.getItemsByType.all({
        $username: user.username,
        $type: "story",
      });

      // Check for new comments on recent stories
      for (const item of items.slice(0, 20)) { // Check last 20 stories
        try {
          const hnItem = await getItem(item.id);
          if (!hnItem) continue;

          const currentDescendants = (hnItem as any).descendants || 0;
          const lastDescendants = item.last_comment_count || 0;

          if (currentDescendants > lastDescendants) {
            console.log(`Found ${currentDescendants - lastDescendants} new comments on item ${item.id}`);
            queries.updateItemCommentCount.run({
              $id: item.id,
              $last_comment_count: currentDescendants,
            });
          }
        } catch (err) {
          console.error(`Failed to update item ${item.id}:`, err);
        }
      }
    } catch (err) {
      console.error(`Failed to update items for ${user.username}:`, err);
    }
  }
}

// Main loop
async function main() {
  console.log("🔄 HN Sync Worker started");
  console.log("📊 Redis URL:", REDIS_URL);

  // Clear any stale locks from previous crashes
  await releaseSyncLock();
  console.log("🧹 Cleared any stale sync locks");

  // Test Redis connection
  const redisOk = await testRedisConnection();
  if (!redisOk) {
    console.error("❌ Redis connection failed! Sync will not work.");
    console.error("   Please verify Redis is running on", REDIS_URL);
  } else {
    console.log("✅ Redis connected successfully");
  }

  // Initial sync
  await syncHackerNews();

  // Regular sync interval
  setInterval(async () => {
    await syncHackerNews();
  }, SYNC_INTERVAL);

  // Update existing items every 5 minutes
  setInterval(async () => {
    await updateExistingItems();
  }, 5 * 60 * 1000);

  // Schedule backfill every 10 minutes
  setInterval(async () => {
    try {
      await backfillThreadRoots(50); // Process 50 items per batch
    } catch (err) {
      console.error("Backfill error:", err);
    }
  }, 10 * 60 * 1000); // 10 minutes

  // Run once on startup (wait 5s)
  setTimeout(() => backfillThreadRoots(50), 5000);
}

main().catch(console.error);
