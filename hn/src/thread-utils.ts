import { queries, findThreadRootInDB } from "./db";
import { getItem } from "./hn-api";

/**
 * Fetch missing parent from HN API and compute thread root
 * Stores fetched parent in DB and marks parent_fetched
 */
export async function fetchParentAndComputeRoot(itemId: number): Promise<number | null> {
  const item = queries.getItemById.get({ $id: itemId });
  if (!item) return null;

  // First try DB-only lookup
  let rootId = findThreadRootInDB(itemId);

  // If we hit a missing parent, fetch from HN
  if (rootId && !queries.getItemById.get({ $id: rootId })) {
    try {
      console.log(`Fetching missing parent ${rootId} from HN for item ${itemId}`);
      const parent = await getItem(rootId);

      if (parent) {
        // Store parent in DB
        const now = Math.floor(Date.now() / 1000);
        queries.insertItem.run({
          $id: parent.id,
          $username: item.username, // Associate with same user
          $type: parent.type,
          $by: (parent as any).by,
          $time: (parent as any).time,
          $title: (parent as any).title || null,
          $text: (parent as any).text || null,
          $url: (parent as any).url || null,
          $score: (parent as any).score || null,
          $parent: (parent as any).parent || null,
          $descendants: (parent as any).descendants || null,
          $fetched_at: now,
          $last_comment_count: (parent as any).descendants || 0,
          $thread_root_id: parent.type === 'story' ? parent.id : null,
          $parent_fetched: 1,
        });

        // Retry finding root now that parent is in DB
        rootId = findThreadRootInDB(itemId);
      }
    } catch (err) {
      console.error(`Failed to fetch parent ${rootId}:`, err);
    }
  }

  // Mark that we attempted to fetch parent
  queries.markParentFetched.run({ $id: itemId });

  return rootId;
}

/**
 * Background job to backfill thread roots for items with unfetched parents
 */
export async function backfillThreadRoots(batchSize = 50): Promise<number> {
  const items = queries.getItemsWithUnfetchedParents.all({ $limit: batchSize });

  if (items.length === 0) return 0;

  console.log(`Backfilling thread roots for ${items.length} items...`);
  let updated = 0;

  for (const item of items) {
    try {
      const rootId = await fetchParentAndComputeRoot(item.id);
      if (rootId) {
        queries.updateThreadRoot.run({ $id: item.id, $thread_root_id: rootId });
        updated++;
      }
    } catch (err) {
      console.error(`Failed to backfill item ${item.id}:`, err);
    }

    // Rate limit: 100ms between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`Updated ${updated}/${items.length} items`);
  return updated;
}
