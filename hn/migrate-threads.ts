import { queries, findThreadRootInDB } from "./src/db";

console.log("Starting thread root migration...");

// Get all items without thread_root_id
const items = queries.getItemsWithUnfetchedParents.all({ $limit: 1000 });
console.log(`Found ${items.length} items needing thread_root_id`);

let updated = 0;
let failed = 0;

for (const item of items) {
  try {
    const rootId = findThreadRootInDB(item.id);
    if (rootId) {
      queries.updateThreadRoot.run({ $id: item.id, $thread_root_id: rootId });
      queries.markParentFetched.run({ $id: item.id });
      updated++;
      console.log(`Updated item ${item.id} with thread_root_id ${rootId}`);
    } else {
      console.log(`Could not find thread root for item ${item.id} (will be handled by backfill)`);
      failed++;
    }
  } catch (err) {
    console.error(`Failed to update item ${item.id}:`, err);
    failed++;
  }
}

console.log(`\nMigration complete: ${updated} updated, ${failed} need backfill`);
