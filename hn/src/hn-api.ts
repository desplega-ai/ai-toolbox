const HN_API_BASE = "https://hacker-news.firebaseio.com/v0";

export interface HNUser {
  id: string;
  created: number;
  karma: number;
  about?: string;
  submitted: number[];
}

export async function getMaxItemId(): Promise<number> {
  const response = await fetch(`${HN_API_BASE}/maxitem.json`);
  if (!response.ok) {
    throw new Error("Failed to fetch max item ID");
  }
  return response.json();
}

export interface HNStory {
  id: number;
  type: "story" | "job" | "poll";
  by: string;
  time: number;
  title: string;
  url?: string;
  text?: string;
  score: number;
  descendants: number;
  kids?: number[];
}

export interface HNComment {
  id: number;
  type: "comment";
  by: string;
  time: number;
  text: string;
  parent: number;
  kids?: number[];
}

export type HNItem = HNStory | HNComment;

export async function getUser(username: string): Promise<HNUser | null> {
  const response = await fetch(`${HN_API_BASE}/user/${username}.json`);
  if (!response.ok) {
    return null;
  }
  return response.json();
}

export async function getItem(id: number): Promise<HNItem | null> {
  const response = await fetch(`${HN_API_BASE}/item/${id}.json`);
  if (!response.ok) {
    return null;
  }
  return response.json();
}

export async function getCommentThread(commentId: number): Promise<HNItem[]> {
  const thread: HNItem[] = [];
  let currentId: number | null = commentId;

  while (currentId !== null) {
    const item = await getItem(currentId);
    if (!item) break;

    thread.unshift(item);

    if (item.type === "comment") {
      currentId = item.parent;
    } else {
      break;
    }
  }

  return thread;
}

export async function getItemComments(itemId: number): Promise<HNComment[]> {
  const item = await getItem(itemId);
  if (!item || !item.kids || item.kids.length === 0) {
    return [];
  }

  const comments: HNComment[] = [];

  for (const kidId of item.kids.slice(0, 50)) {
    const comment = await getItem(kidId);
    if (comment && comment.type === "comment") {
      comments.push(comment as HNComment);
    }
  }

  return comments;
}
