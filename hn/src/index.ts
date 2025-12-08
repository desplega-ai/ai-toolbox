import { serve } from "bun";
import index from "./index.html";
import { queries, findThreadRootInDB } from "./db";
import { getUser, getItem, getCommentThread, getItemComments, getMaxItemId, type HNItem } from "./hn-api";
import { getLastGlobalSync, setLastGlobalSync, testRedisConnection, releaseSyncLock } from "./redis";

// Sync is now handled by sync-worker.ts

async function syncUser(username: string) {
  // Lightweight sync - just fetch user's recent items
  const hnUser = await getUser(username);
  if (!hnUser) {
    console.log(`❌ User ${username} not found on HN`);
    return { error: "User not found", newCount: 0, skippedCount: 0 };
  }

  const trackedUser = queries.getTrackedUser.get({ $username: username });
  const now = Math.floor(Date.now() / 1000);

  // Fetch user's recent submissions and check which ones we have
  const recentSubmissions = hnUser.submitted.slice(0, 100);
  let newCount = 0;
  let skippedCount = 0;

  console.log(`🔄 Syncing user ${username}: checking ${recentSubmissions.length} recent items`);

  for (const itemId of recentSubmissions) {
    const existingItem = queries.getItemById.get({ $id: itemId });
    if (existingItem) {
      skippedCount++;
      continue;
    }

    // Item not in DB yet, fetch and store it
    const item = await getItem(itemId);
    if (!item) continue;

    // Compute thread root (DB-only, no HN API calls)
    const threadRootId = findThreadRootInDB(item.id);

    queries.insertItem.run({
      $id: item.id,
      $username: username,
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
      $parent_fetched: threadRootId !== null ? 1 : 0,
    });
    newCount++;
  }

  console.log(`✅ User ${username} sync complete: ${newCount} new, ${skippedCount} existing`);

  queries.addTrackedUser.run({
    $username: username,
    $last_checked: now,
    $created_at: trackedUser?.created_at || now,
  });

  return { newCount, skippedCount, totalChecked: recentSubmissions.length };
}

const server = serve({
  port: 3010,
  routes: {
    "/*": index,

    "/api/users": {
      async GET() {
        try {
          const users = queries.getAllTrackedUsers.all({});
          const usersWithCounts = users.map((user) => {
            const unreadResult = queries.getUnreadCountByUser.get({
              $username: user.username,
            });
            const totalResult = queries.getTotalItemCountByUser.get({
              $username: user.username,
            });
            return {
              ...user,
              unread_count: unreadResult?.unread_count || 0,
              total_count: totalResult?.total_count || 0,
            };
          });
          return Response.json({ users: usersWithCounts });
        } catch (error) {
          console.error("Get users error:", error);
          return Response.json(
            { error: "Failed to get users" },
            { status: 500 }
          );
        }
      },
    },

    "/api/user/:username/sync": {
      async POST(req) {
        const { username } = req.params;

        try {
          const hnUser = await getUser(username);
          if (!hnUser) {
            return Response.json({ error: "User not found" }, { status: 404 });
          }

          const trackedUser = queries.getTrackedUser.get({ $username: username });
          const now = Math.floor(Date.now() / 1000);

          // Create user if doesn't exist
          if (!trackedUser) {
            queries.addTrackedUser.run({
              $username: username,
              $last_checked: 0,
              $created_at: now,
            });
          }

          const result = await syncUser(username);

          return Response.json({
            username,
            newItemsCount: result.newCount,
            existingItemsCount: result.skippedCount,
            totalChecked: result.totalChecked,
          });
        } catch (error) {
          console.error("Sync error:", error);
          return Response.json(
            { error: "Failed to sync user data" },
            { status: 500 }
          );
        }
      },
    },

    "/api/user/:username/items/:type": {
      async GET(req) {
        const { username, type } = req.params;

        try {
          const items = queries.getItemsByType.all({
            $username: username,
            $type: type,
          });
          return Response.json({ items });
        } catch (error) {
          console.error("Get items error:", error);
          return Response.json(
            { error: "Failed to get items" },
            { status: 500 }
          );
        }
      },
    },

    "/api/item/:id": {
      async GET(req) {
        const { id } = req.params;

        try {
          const item = queries.getItemById.get({ $id: parseInt(id) });
          return Response.json({ item: item || null });
        } catch (error) {
          console.error("Get item error:", error);
          return Response.json(
            { error: "Failed to get item" },
            { status: 500 }
          );
        }
      },
    },

    "/api/item/:id/read": {
      async POST(req) {
        const { id } = req.params;

        try {
          queries.markItemAsRead.run({ $id: parseInt(id) });
          return Response.json({ success: true });
        } catch (error) {
          console.error("Mark read error:", error);
          return Response.json(
            { error: "Failed to mark as read" },
            { status: 500 }
          );
        }
      },
    },

    "/api/user/:username": {
      async GET(req) {
        const { username } = req.params;

        try {
          const trackedUser = queries.getTrackedUser.get({ $username: username });
          const unreadResult = queries.getUnreadCountByUser.get({
            $username: username,
          });
          return Response.json({
            user: trackedUser || null,
            unread_count: unreadResult?.unread_count || 0,
          });
        } catch (error) {
          console.error("Get user error:", error);
          return Response.json(
            { error: "Failed to get user" },
            { status: 500 }
          );
        }
      },
    },

    "/api/user/:username/mark-all-read": {
      async POST(req) {
        const { username } = req.params;

        try {
          queries.markAllAsReadForUser.run({ $username: username });
          return Response.json({ success: true });
        } catch (error) {
          console.error("Mark all read error:", error);
          return Response.json(
            { error: "Failed to mark all as read" },
            { status: 500 }
          );
        }
      },
    },

    "/api/item/:id/thread": {
      async GET(req) {
        const { id } = req.params;

        try {
          const thread = await getCommentThread(parseInt(id));
          return Response.json({ thread });
        } catch (error) {
          console.error("Get thread error:", error);
          return Response.json(
            { error: "Failed to get comment thread" },
            { status: 500 }
          );
        }
      },
    },

    "/api/item/:id/comments": {
      async GET(req) {
        const { id } = req.params;

        try {
          const comments = await getItemComments(parseInt(id));
          return Response.json({ comments });
        } catch (error) {
          console.error("Get comments error:", error);
          return Response.json(
            { error: "Failed to get item comments" },
            { status: 500 }
          );
        }
      },
    },

    "/api/user/:username/threads/:type": {
      async GET(req) {
        const { username, type } = req.params;

        try {
          if (type === "story") {
            const threads = queries.getStoryThreads.all({
              $username: username,
              $limit: 1000,
              $offset: 0,
            });
            return Response.json({ threads });
          } else if (type === "comment") {
            const threadGroups = queries.getCommentThreads.all({
              $username: username,
              $limit: 1000,
              $offset: 0,
            });

            // Enrich with representative comment and root story metadata
            const threads = threadGroups.map((group) => {
              // Get earliest comment as representative
              const repComment = queries.getItemById.get({
                $id: group.earliest_comment_id,
              });

              // Get root story metadata
              const rootStory = queries.getRootStory.get({
                $id: group.thread_root_id,
              });

              return {
                ...repComment,
                thread_root_id: group.thread_root_id,
                user_comment_count: group.user_comment_count,
                thread_unread_count: group.thread_unread_count,
                latest_activity: group.latest_activity,
                root_title: rootStory?.title || null,
                root_url: rootStory?.url || null,
                root_score: rootStory?.score || null,
                root_fetching: !rootStory,
              };
            });

            return Response.json({ threads });
          }

          return Response.json({ threads: [] });
        } catch (error) {
          console.error("Get threads error:", error);
          return Response.json(
            { error: "Failed to get threads" },
            { status: 500 }
          );
        }
      },
    },

    "/api/thread/:rootId/comments/:username": {
      async GET(req) {
        const { rootId, username } = req.params;

        try {
          const comments = queries.getUserCommentsInThread.all({
            $username: username,
            $thread_root_id: parseInt(rootId),
          });

          return Response.json({ comments });
        } catch (error) {
          console.error("Get thread comments error:", error);
          return Response.json(
            { error: "Failed to get thread comments" },
            { status: 500 }
          );
        }
      },
    },

    "/api/thread/:rootId/read": {
      async POST(req) {
        const { rootId } = req.params;
        const body = await req.json();
        const { username } = body;

        try {
          queries.markThreadAsRead.run({
            $username: username,
            $thread_root_id: parseInt(rootId),
          });
          return Response.json({ success: true });
        } catch (error) {
          console.error("Mark thread read error:", error);
          return Response.json(
            { error: "Failed to mark thread as read" },
            { status: 500 }
          );
        }
      },
    },

    "/api/sync/status": {
      async GET() {
        try {
          const lastSync = await getLastGlobalSync();
          const maxItem = await getMaxItemId();
          const users = queries.getAllTrackedUsers.all({});
          const redisOk = await testRedisConnection();

          return Response.json({
            status: "ok",
            lastSyncedItemId: lastSync,
            currentMaxItemId: maxItem,
            itemsBehind: maxItem - lastSync,
            trackedUserCount: users.length,
            trackedUsers: users.map(u => {
              const count = queries.getTotalItemCountByUser.get({ $username: u.username });
              return {
                username: u.username,
                itemCount: count?.total_count || 0,
                lastChecked: u.last_checked
              };
            }),
            redis: {
              connected: redisOk,
              url: process.env.REDIS_URL || "redis://localhost:6380"
            }
          });
        } catch (error) {
          console.error("Sync status error:", error);
          return Response.json(
            { error: "Failed to get sync status" },
            { status: 500 }
          );
        }
      }
    },

    "/api/sync/reset": {
      async POST(req) {
        try {
          const body = await req.json();
          const newPosition = body.position || 0;

          // Reset sync position
          await setLastGlobalSync(newPosition);
          await releaseSyncLock();

          console.log(`🔄 Sync reset to position ${newPosition}`);

          return Response.json({
            success: true,
            newPosition,
            message: "Sync position reset. Next sync will start from this position."
          });
        } catch (error) {
          console.error("Sync reset error:", error);
          return Response.json(
            { error: "Failed to reset sync" },
            { status: 500 }
          );
        }
      }
    },
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
