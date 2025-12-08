import { Database } from "bun:sqlite";

const db = new Database("hn-tracker.sqlite", { create: true });

// Enable WAL mode for better concurrency
db.run("PRAGMA journal_mode = WAL;");

// Create tables
db.run(`
  CREATE TABLE IF NOT EXISTS tracked_users (
    username TEXT PRIMARY KEY,
    last_checked INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS thread_views (
    username TEXT NOT NULL,
    thread_root_id INTEGER NOT NULL,
    last_seen_time INTEGER NOT NULL,
    PRIMARY KEY (username, thread_root_id),
    FOREIGN KEY (username) REFERENCES tracked_users(username)
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL,
    type TEXT NOT NULL,
    by TEXT NOT NULL,
    time INTEGER NOT NULL,
    title TEXT,
    text TEXT,
    url TEXT,
    score INTEGER,
    parent INTEGER,
    descendants INTEGER,
    fetched_at INTEGER NOT NULL,
    is_read INTEGER DEFAULT 0,
    last_comment_count INTEGER DEFAULT 0,
    thread_root_id INTEGER,
    parent_fetched INTEGER DEFAULT 0,
    FOREIGN KEY (username) REFERENCES tracked_users(username)
  )
`);

// Create indexes
db.run(`
  CREATE INDEX IF NOT EXISTS idx_items_username_time ON items(username, time DESC)
`);

db.run(`
  CREATE INDEX IF NOT EXISTS idx_items_username_read ON items(username, is_read)
`);

db.run(`
  CREATE INDEX IF NOT EXISTS idx_items_thread_root ON items(username, thread_root_id, time DESC)
`);

db.run(`
  CREATE INDEX IF NOT EXISTS idx_items_parent ON items(parent)
`);

db.run(`
  CREATE INDEX IF NOT EXISTS idx_items_unfetched_parents ON items(parent) WHERE parent IS NOT NULL AND parent_fetched = 0
`);

// TypeScript types
export interface TrackedUser {
  username: string;
  last_checked: number;
  created_at: number;
}

export interface HNItem {
  id: number;
  username: string;
  type: string;
  by: string;
  time: number;
  title: string | null;
  text: string | null;
  url: string | null;
  score: number | null;
  parent: number | null;
  descendants: number | null;
  fetched_at: number;
  is_read: number;
  last_comment_count: number;
  thread_root_id: number | null;
  parent_fetched: number;
}

// Find thread root using DB-only traversal (no API calls)
export function findThreadRootInDB(itemId: number): number | null {
  const item = queries.getItemById.get({ $id: itemId });
  if (!item) return null;
  if (item.type === 'story') return item.id;

  let currentId: number | null = item.parent;
  const visited = new Set<number>([itemId]);

  while (currentId !== null) {
    if (visited.has(currentId)) return null; // Cycle detected
    visited.add(currentId);

    const parent = queries.getItemById.get({ $id: currentId });
    if (!parent) return currentId; // Parent not in DB, return as best guess
    if (parent.type === 'story') return parent.id;

    currentId = parent.parent;
  }

  return null;
}

// Prepared statements with type safety
export const queries = {
  addTrackedUser: db.query<
    TrackedUser,
    { $username: string; $last_checked: number; $created_at: number }
  >(`
    INSERT INTO tracked_users (username, last_checked, created_at)
    VALUES ($username, $last_checked, $created_at)
    ON CONFLICT(username) DO UPDATE SET last_checked = $last_checked
  `),

  getTrackedUser: db.query<TrackedUser, { $username: string }>(`
    SELECT * FROM tracked_users WHERE username = $username
  `),

  insertItem: db.query<
    HNItem,
    {
      $id: number;
      $username: string;
      $type: string;
      $by: string;
      $time: number;
      $title: string | null;
      $text: string | null;
      $url: string | null;
      $score: number | null;
      $parent: number | null;
      $descendants: number | null;
      $fetched_at: number;
      $last_comment_count: number;
      $thread_root_id: number | null;
      $parent_fetched: number;
    }
  >(`
    INSERT OR REPLACE INTO items (id, username, type, by, time, title, text, url, score, parent, descendants, fetched_at, last_comment_count, thread_root_id, parent_fetched)
    VALUES ($id, $username, $type, $by, $time, $title, $text, $url, $score, $parent, $descendants, $fetched_at, $last_comment_count, $thread_root_id, $parent_fetched)
  `),

  updateItemCommentCount: db.query<
    HNItem,
    { $id: number; $last_comment_count: number }
  >(`
    UPDATE items SET last_comment_count = $last_comment_count WHERE id = $id
  `),

  getNewItemsForUser: db.query<HNItem, { $username: string; $since: number }>(`
    SELECT * FROM items
    WHERE username = $username AND time > $since
    ORDER BY time DESC
  `),

  getAllItemsForUser: db.query<HNItem, { $username: string }>(`
    SELECT * FROM items
    WHERE username = $username
    ORDER BY time DESC
    LIMIT 100
  `),

  getAllTrackedUsers: db.query<TrackedUser, {}>(`
    SELECT * FROM tracked_users
    ORDER BY username ASC
  `),

  getUnreadCountByUser: db.query<
    { username: string; unread_count: number },
    { $username: string }
  >(`
    SELECT username, COUNT(*) as unread_count
    FROM items
    WHERE username = $username AND is_read = 0
    GROUP BY username
  `),

  getTotalItemCountByUser: db.query<
    { total_count: number },
    { $username: string }
  >(`
    SELECT COUNT(*) as total_count
    FROM items
    WHERE username = $username
  `),

  getItemsByType: db.query<HNItem, { $username: string; $type: string }>(`
    SELECT * FROM items
    WHERE username = $username AND type = $type
    ORDER BY time DESC
  `),

  getItemById: db.query<HNItem, { $id: number }>(`
    SELECT * FROM items WHERE id = $id
  `),

  markItemAsRead: db.query<HNItem, { $id: number }>(`
    UPDATE items SET is_read = 1 WHERE id = $id
  `),

  markAllAsReadForUser: db.query<HNItem, { $username: string }>(`
    UPDATE items SET is_read = 1 WHERE username = $username
  `),

  // Thread view tracking
  recordThreadView: db.query<void, { $username: string; $thread_root_id: number; $time: number }>(`
    INSERT OR REPLACE INTO thread_views (username, thread_root_id, last_seen_time)
    VALUES ($username, $thread_root_id, $time)
  `),

  getThreadView: db.query<{ last_seen_time: number }, { $username: string; $thread_root_id: number }>(`
    SELECT last_seen_time FROM thread_views
    WHERE username = $username AND thread_root_id = $thread_root_id
  `),

  // Get unique story threads with pagination
  getStoryThreads: db.query<
    HNItem & {
      thread_item_count: number;
      thread_unread_count: number;
      latest_activity: number;
      last_seen_time: number | null;
      has_new_activity: number;
    },
    { $username: string; $limit: number; $offset: number }
  >(`
    SELECT
      items.*,
      COUNT(DISTINCT t.id) - 1 as thread_item_count,
      SUM(CASE WHEN t.is_read = 0 THEN 1 ELSE 0 END) as thread_unread_count,
      MAX(t.time) as latest_activity,
      tv.last_seen_time,
      CASE WHEN tv.last_seen_time IS NULL OR MAX(t.time) > tv.last_seen_time THEN 1 ELSE 0 END as has_new_activity
    FROM items
    LEFT JOIN items t ON t.thread_root_id = items.id AND t.username = items.username
    LEFT JOIN thread_views tv ON tv.username = items.username AND tv.thread_root_id = items.id
    WHERE items.username = $username
      AND items.type = 'story'
      AND items.thread_root_id = items.id
    GROUP BY items.id
    ORDER BY latest_activity DESC
    LIMIT $limit OFFSET $offset
  `),

  getStoryThreadCount: db.query<{ count: number }, { $username: string }>(`
    SELECT COUNT(DISTINCT id) as count
    FROM items
    WHERE username = $username AND type = 'story' AND thread_root_id = id
  `),

  // Get unique comment threads (grouped by root story)
  getCommentThreads: db.query<
    {
      thread_root_id: number;
      user_comment_count: number;
      thread_unread_count: number;
      latest_activity: number;
      earliest_comment_id: number;
      earliest_comment_time: number;
      last_seen_time: number | null;
      has_new_activity: number;
    },
    { $username: string; $limit: number; $offset: number }
  >(`
    SELECT
      c.thread_root_id,
      COUNT(*) as user_comment_count,
      SUM(CASE WHEN c.is_read = 0 THEN 1 ELSE 0 END) as thread_unread_count,
      MAX(c.time) as latest_activity,
      MIN(c.id) as earliest_comment_id,
      MIN(c.time) as earliest_comment_time,
      tv.last_seen_time,
      CASE WHEN tv.last_seen_time IS NULL OR MAX(c.time) > tv.last_seen_time THEN 1 ELSE 0 END as has_new_activity
    FROM items c
    LEFT JOIN thread_views tv ON tv.username = c.username AND tv.thread_root_id = c.thread_root_id
    WHERE c.username = $username
      AND c.type = 'comment'
      AND c.thread_root_id IS NOT NULL
    GROUP BY c.thread_root_id
    ORDER BY earliest_comment_time DESC
    LIMIT $limit OFFSET $offset
  `),

  getCommentThreadCount: db.query<{ count: number }, { $username: string }>(`
    SELECT COUNT(DISTINCT thread_root_id) as count
    FROM items
    WHERE username = $username AND type = 'comment' AND thread_root_id IS NOT NULL
  `),

  // Get all user comments in a thread
  getUserCommentsInThread: db.query<HNItem, { $username: string; $thread_root_id: number }>(`
    SELECT * FROM items
    WHERE username = $username
      AND thread_root_id = $thread_root_id
      AND type = 'comment'
    ORDER BY time ASC
  `),

  // Get root story by ID
  getRootStory: db.query<HNItem, { $id: number }>(`
    SELECT * FROM items WHERE id = $id AND type = 'story'
  `),

  // Update thread_root_id
  updateThreadRoot: db.query<void, { $id: number; $thread_root_id: number }>(`
    UPDATE items SET thread_root_id = $thread_root_id WHERE id = $id
  `),

  // Mark parent as fetched
  markParentFetched: db.query<void, { $id: number }>(`
    UPDATE items SET parent_fetched = 1 WHERE id = $id
  `),

  // Mark entire thread as read
  markThreadAsRead: db.query<void, { $username: string; $thread_root_id: number }>(`
    UPDATE items SET is_read = 1
    WHERE username = $username AND thread_root_id = $thread_root_id
  `),

  // Get items with unfetched parents
  getItemsWithUnfetchedParents: db.query<HNItem, { $limit: number }>(`
    SELECT * FROM items
    WHERE parent IS NOT NULL
      AND parent_fetched = 0
      AND thread_root_id IS NULL
    LIMIT $limit
  `),
};

export default db;
