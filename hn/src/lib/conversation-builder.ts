interface HNItem {
  id: number;
  type: string;
  by: string;
  time: number;
  title: string | null;
  text: string | null;
  url: string | null;
  score: number | null;
  parent: number | null;
  descendants: number | null;
  is_read: number;
  thread_root_id?: number | null;
}

export interface ConversationItem {
  item: HNItem;
  depth: number;
  isUserComment: boolean;
  isReplyToUser: boolean;
  isContext: boolean;
  parentId: number | null;
}

export function buildConversationPath(
  commentThread: HNItem[],
  threadComments: HNItem[],
  postComments: HNItem[],
  rootId: number,
  selectedUser: string,
  selectedThreadId?: number
): ConversationItem[] {
  // Step 1: Build item lookup map
  const itemMap = new Map<number, HNItem>();
  [...commentThread, ...threadComments, ...postComments].forEach((item) => {
    if (!itemMap.has(item.id)) {
      itemMap.set(item.id, item);
    }
  });

  // Step 2: Identify user comments
  const userCommentIds = new Set(threadComments.map((c) => c.id));

  // Step 3: Build conversation paths for each user comment
  const conversationPaths: ConversationItem[][] = [];

  for (const userComment of threadComments) {
    const path: ConversationItem[] = [];

    // 3a: Build upward chain (context from user comment to root)
    const upwardChain = buildUpwardChain(userComment.id, itemMap, rootId);
    upwardChain.forEach((item, idx) => {
      path.push({
        item,
        depth: idx,
        isUserComment: userCommentIds.has(item.id),
        isReplyToUser: false,
        isContext: !userCommentIds.has(item.id),
        parentId: item.parent || null,
      });
    });

    // 3b: Build downward chain (replies to user's comment)
    const userDepth = upwardChain.length - 1;
    const downwardChain = buildDownwardChain(
      userComment.id,
      postComments,
      itemMap,
      userDepth
    );
    path.push(...downwardChain);

    conversationPaths.push(path);
  }

  // Step 4: Merge and deduplicate paths
  return mergeConversationPaths(conversationPaths, userCommentIds);
}

function buildUpwardChain(
  commentId: number,
  itemMap: Map<number, HNItem>,
  rootId: number
): HNItem[] {
  const chain: HNItem[] = [];
  let currentId: number | null = commentId;
  const visited = new Set<number>();

  while (currentId !== null && !visited.has(currentId)) {
    visited.add(currentId);
    const item = itemMap.get(currentId);
    if (!item) break;

    chain.unshift(item); // Add to front for chronological order

    // Stop at root or story type
    if (item.id === rootId || item.type === "story") break;
    currentId = item.parent || null;
  }

  return chain;
}

function buildDownwardChain(
  parentId: number,
  allComments: HNItem[],
  itemMap: Map<number, HNItem>,
  startDepth: number,
  maxDepth: number = 10
): ConversationItem[] {
  if (startDepth >= maxDepth) return [];

  const replies: ConversationItem[] = [];
  const directReplies = allComments.filter((c) => c.parent === parentId);

  directReplies.forEach((reply) => {
    replies.push({
      item: reply,
      depth: startDepth + 1,
      isUserComment: false,
      isReplyToUser: true,
      isContext: false,
      parentId: reply.parent || null,
    });

    // Recursively get nested replies (with depth limit)
    if (startDepth + 1 < maxDepth) {
      const nestedReplies = buildDownwardChain(
        reply.id,
        allComments,
        itemMap,
        startDepth + 1,
        maxDepth
      );
      replies.push(...nestedReplies);
    }
  });

  return replies;
}

function mergeConversationPaths(
  paths: ConversationItem[][],
  userCommentIds: Set<number>
): ConversationItem[] {
  const merged = new Map<number, ConversationItem>();

  // Flatten all paths and deduplicate by item ID
  paths.forEach((path) => {
    path.forEach((convItem) => {
      if (!merged.has(convItem.item.id)) {
        merged.set(convItem.item.id, convItem);
      } else {
        // Update flags if this occurrence has more information
        const existing = merged.get(convItem.item.id)!;
        existing.isUserComment =
          existing.isUserComment || convItem.isUserComment;
        existing.isReplyToUser =
          existing.isReplyToUser || convItem.isReplyToUser;
        existing.isContext = existing.isContext && convItem.isContext;
      }
    });
  });

  // Convert to array and sort by time (chronological)
  return Array.from(merged.values()).sort(
    (a, b) => a.item.time - b.item.time
  );
}
