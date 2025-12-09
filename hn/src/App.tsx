import { useState, useEffect, useMemo } from "react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Card, CardContent } from "./components/ui/card";
import { Toaster, toast } from "sonner";
import "./index.css";
import { buildConversationPath } from "./lib/conversation-builder";
import { ChatMessage } from "./components/ChatMessage";

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

interface ThreadItem extends HNItem {
  // Story threads
  thread_item_count?: number;

  // Comment threads
  user_comment_count?: number;
  root_title?: string | null;
  root_url?: string | null;
  root_score?: number | null;
  root_fetching?: boolean;

  // Both
  thread_unread_count: number;
  latest_activity: number;
}

interface TrackedUser {
  username: string;
  last_checked: number;
  created_at: number;
  unread_count?: number;
  total_count?: number;
}

type View = "users" | "posts" | "comments";

export function App() {
  const [users, setUsers] = useState<TrackedUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [view, setView] = useState<View>("users");
  const [threads, setThreads] = useState<ThreadItem[]>([]);
  const [selectedThread, setSelectedThread] = useState<ThreadItem | null>(null);
  const [threadComments, setThreadComments] = useState<HNItem[]>([]);
  const [newUsername, setNewUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [commentThread, setCommentThread] = useState<any[]>([]);
  const [postComments, setPostComments] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);

  // Build conversation path from thread data
  const conversationItems = useMemo(() => {
    if (!selectedThread) return [];
    const rootId = selectedThread.thread_root_id || selectedThread.id;
    return buildConversationPath(
      commentThread,
      threadComments,
      postComments,
      rootId,
      selectedUser || "",
      selectedThread.id
    );
  }, [commentThread, threadComments, postComments, selectedThread, selectedUser]);

  // Initialize from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const user = params.get('user');
    const viewParam = params.get('view');
    const itemId = params.get('item');

    if (user) {
      setSelectedUser(user);
      const validView = (viewParam === 'posts' || viewParam === 'comments') ? viewParam : 'posts';
      setView(validView);
      loadThreads(user, validView === 'posts' ? 'story' : 'comment');

      if (itemId) {
        // Load the item after a brief delay to ensure items are loaded
        setTimeout(async () => {
          const res = await fetch(`/api/item/${itemId}`);
          const data = await res.json();
          if (data.item) {
            handleThreadClick(data.item);
          }
        }, 500);
      }
    }
  }, []);

  useEffect(() => {
    loadUsers();
    const interval = setInterval(loadUsers, 10000);
    return () => clearInterval(interval);
  }, []);

  // Update URL when state changes
  const updateURL = (user: string | null, viewType: View, itemId?: number | null) => {
    const params = new URLSearchParams();
    if (user) {
      params.set('user', user);
      if (viewType !== 'users') {
        params.set('view', viewType);
      }
      if (itemId) {
        params.set('item', itemId.toString());
      }
    }
    const newURL = params.toString() ? `?${params.toString()}` : window.location.pathname;
    window.history.pushState({}, '', newURL);
  };

  const loadUsers = async () => {
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      setUsers(data.users);
    } catch (err) {
      console.error("Failed to load users:", err);
    }
  };

  const handleAddUser = async () => {
    if (!newUsername.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/user/${newUsername}/sync`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("User not found");
      await loadUsers();
      const username = newUsername;
      setNewUsername("");
      setSelectedUser(username);
      setView("posts");
      loadThreads(username, "story");
      updateURL(username, "posts");
      toast.success(`Added ${username} to tracking`);
    } catch (err) {
      setError("Failed to add user");
      toast.error("Failed to add user - user may not exist");
    } finally {
      setLoading(false);
    }
  };

  const loadThreads = async (username: string, type: string) => {
    try {
      const res = await fetch(`/api/user/${username}/threads/${type}`);
      const data = await res.json();
      setThreads(data.threads || []);
    } catch (err) {
      console.error("Failed to load threads:", err);
    }
  };

  const handleUserClick = (username: string) => {
    setSelectedUser(username);
    setSelectedThread(null);
    setView("posts");
    loadThreads(username, "story");
    updateURL(username, "posts");
  };

  const handleUnselectUser = () => {
    setSelectedUser(null);
    setSelectedThread(null);
    setView("users");
    setThreads([]);
    setThreadComments([]);
    setCommentThread([]);
    setPostComments([]);
    updateURL(null, "users");
  };

  const handleViewChange = (newView: View) => {
    setView(newView);
    setSelectedThread(null);
    setThreadComments([]);
    setCommentThread([]);
    setPostComments([]);
    if (selectedUser) {
      if (newView === "posts") loadThreads(selectedUser, "story");
      else if (newView === "comments") loadThreads(selectedUser, "comment");
      updateURL(selectedUser, newView);
    }
  };

  const handleThreadClick = async (thread: ThreadItem) => {
    setSelectedThread(thread);
    setCommentThread([]);
    setPostComments([]);
    setThreadComments([]);

    const rootId = thread.thread_root_id || thread.id;

    if (selectedUser) {
      updateURL(selectedUser, view, thread.id);
    }

    // For comment threads, load all user's comments in this thread
    if (view === "comments" && selectedUser) {
      try {
        const res = await fetch(`/api/thread/${rootId}/comments/${selectedUser}`);
        const data = await res.json();
        setThreadComments(data.comments || []);
      } catch (err) {
        console.error("Failed to load thread comments:", err);
      }
    }

    // Load thread context (parent chain)
    try {
      const res = await fetch(`/api/item/${thread.id}/thread`);
      const data = await res.json();
      setCommentThread(data.thread || []);
    } catch (err) {
      console.error("Failed to load thread:", err);
    }

    // Load replies (for root story)
    try {
      const res = await fetch(`/api/item/${rootId}/comments`);
      const data = await res.json();
      setPostComments(data.comments || []);
    } catch (err) {
      console.error("Failed to load comments:", err);
    }

    // Mark thread as read
    if (thread.thread_unread_count > 0 && selectedUser) {
      await fetch(`/api/thread/${rootId}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: selectedUser }),
      });
      await loadUsers();
      const type = view === "posts" ? "story" : "comment";
      loadThreads(selectedUser, type);
    }
  };

  const handleMarkAllRead = async () => {
    if (!selectedUser) return;
    try {
      await fetch(`/api/user/${selectedUser}/mark-all-read`, { method: "POST" });
      await loadUsers();
      if (selectedUser) {
        const type = view === "posts" ? "story" : "comment";
        loadThreads(selectedUser, type);
      }
      toast.success("All items marked as read");
    } catch (err) {
      console.error("Failed to mark all as read:", err);
      toast.error("Failed to mark all as read");
    }
  };

  const handleSyncUser = async () => {
    if (!selectedUser || syncing) return;
    setSyncing(true);
    try {
      const res = await fetch(`/api/user/${selectedUser}/sync`, { method: "POST" });
      const data = await res.json();
      await loadUsers();
      if (selectedUser) {
        const type = view === "posts" ? "story" : "comment";
        loadThreads(selectedUser, type);
      }
      if (data.newItemsCount > 0) {
        toast.success(`Synced ${selectedUser} - ${data.newItemsCount} new items`);
      } else {
        toast.success(`Synced ${selectedUser} - no new items`);
      }
    } catch (err) {
      console.error("Failed to sync user:", err);
      toast.error("Failed to sync user");
    } finally {
      setSyncing(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const stripHtml = (html: string | null) => {
    if (!html) return "";
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
  };

  const postsCount = threads.filter((t) => t.type === "story").length;
  const commentsCount = threads.length - postsCount;
  const unreadPosts = threads.filter((t) => t.type === "story" && t.thread_unread_count > 0).length;
  const unreadComments = threads.filter((t) => t.type === "comment" && t.thread_unread_count > 0).length;

  const selectedUserData = users.find((u) => u.username === selectedUser);
  const lastSyncText = selectedUserData?.last_checked
    ? `Last synced: ${formatDate(selectedUserData.last_checked)}`
    : "Never synced";

  return (
    <>
      <Toaster position="top-right" richColors />
      <div className="flex h-screen">
      {/* Sidebar */}
      <div className={`${selectedUser ? "w-80" : "w-80"} bg-white border-r transition-all flex-shrink-0 flex flex-col h-screen`}>
        <div className="p-4 border-b flex-shrink-0">
          <h1 className="text-xl font-bold mb-4">HN Tracker</h1>
          <div className="flex gap-2">
            <Input
              placeholder="HN username"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddUser()}
              disabled={loading}
            />
            <Button onClick={handleAddUser} disabled={loading} size="sm">
              {loading ? "..." : "Add"}
            </Button>
          </div>
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        </div>

        {selectedUser && (
          <div className="p-4 border-b bg-gray-50 flex-shrink-0">
            <div className="flex justify-between items-center mb-1">
              <h2 className="font-semibold text-lg">{selectedUser}</h2>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSyncUser}
                  className="text-xs cursor-pointer hover:bg-gray-200"
                  title={lastSyncText}
                  disabled={syncing}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={syncing ? "animate-spin" : ""}
                  >
                    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                  </svg>
                </Button>
                {(unreadPosts > 0 || unreadComments > 0) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleMarkAllRead}
                    className="text-xs"
                  >
                    Mark All Read
                  </Button>
                )}
              </div>
            </div>
            <div className="text-xs text-gray-500 mb-3">{lastSyncText}</div>
            <div className="flex gap-2">
              <Button
                variant={view === "posts" ? "default" : "outline"}
                size="sm"
                onClick={() => handleViewChange("posts")}
                className="flex-1"
              >
                Posts {unreadPosts > 0 && (
                  <span className="ml-1 bg-red-500 text-white rounded-full px-2 py-0.5 text-xs">
                    {unreadPosts}
                  </span>
                )}
              </Button>
              <Button
                variant={view === "comments" ? "default" : "outline"}
                size="sm"
                onClick={() => handleViewChange("comments")}
                className="flex-1"
              >
                Comments {unreadComments > 0 && (
                  <span className="ml-1 bg-red-500 text-white rounded-full px-2 py-0.5 text-xs">
                    {unreadComments}
                  </span>
                )}
              </Button>
            </div>
          </div>
        )}

        <div className="overflow-y-auto flex-1 min-h-0">
          {!selectedUser ? (
            <div className="p-4">
              <h2 className="font-semibold mb-3">Tracked Users</h2>
              {users.map((user) => (
                <div
                  key={user.username}
                  onClick={() => handleUserClick(user.username)}
                  className="p-3 hover:bg-gray-100 cursor-pointer rounded mb-2 border border-gray-200"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{user.username}</span>
                    {user.unread_count! > 0 && (
                      <span className="bg-red-500 text-white rounded-full px-2 py-1 text-xs">
                        {user.unread_count}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {user.total_count || 0} items tracked
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div>
              {threads.map((thread) => (
                <div
                  key={thread.thread_root_id || thread.id}
                  onClick={() => handleThreadClick(thread)}
                  className={`p-3 border-b cursor-pointer hover:bg-gray-50 ${
                    selectedThread?.id === thread.id
                      ? thread.type === "story"
                        ? "bg-purple-100 border-l-4 border-purple-500"
                        : "bg-green-100 border-l-4 border-green-500"
                      : thread.thread_unread_count > 0
                        ? thread.type === "story"
                          ? "bg-purple-50"
                          : "bg-green-50"
                        : ""
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold uppercase ${
                        thread.type === "story" ? "text-purple-600" : "text-green-600"
                      }`}>
                        {thread.type === "story" ? "POST" : "THREAD"}
                      </span>
                      <span className="text-xs text-gray-500">
                        {formatDate(thread.latest_activity)}
                      </span>
                    </div>
                    {thread.thread_unread_count > 0 && (
                      <span className={`px-2 py-0.5 rounded-full text-xs text-white ${
                        thread.type === "story" ? "bg-purple-500" : "bg-green-500"
                      }`}>
                        {thread.thread_unread_count}
                      </span>
                    )}
                  </div>

                  {/* Title for posts, or root title for comments */}
                  {thread.title && (
                    <h3 className="font-medium text-sm line-clamp-2">{thread.title}</h3>
                  )}
                  {!thread.title && thread.root_title && (
                    <h3 className="font-medium text-sm line-clamp-2 text-gray-700">
                      Re: {thread.root_title}
                    </h3>
                  )}
                  {!thread.title && !thread.root_title && thread.root_fetching && (
                    <h3 className="font-medium text-sm text-gray-400 italic">
                      Loading parent thread...
                    </h3>
                  )}
                  {!thread.title && !thread.root_title && !thread.root_fetching && thread.text && (
                    <p className="text-sm text-gray-700 line-clamp-2">
                      {stripHtml(thread.text)}
                    </p>
                  )}

                  {/* Thread metadata */}
                  <div className="flex gap-3 text-xs text-gray-500 mt-1">
                    {thread.user_comment_count && thread.user_comment_count > 1 && (
                      <span className="font-semibold text-green-600">
                        {thread.user_comment_count} your comments
                      </span>
                    )}
                    {thread.thread_item_count && thread.thread_item_count > 0 && (
                      <span>{thread.thread_item_count} replies</span>
                    )}
                    {thread.descendants !== null && (
                      <span>{thread.descendants} total</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedUser && (
          <div className="p-3 border-t flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleUnselectUser}
              className="w-full"
            >
              ← Back to Users
            </Button>
          </div>
        )}
      </div>

      {/* Main Content - Chat-Style Thread View */}
      {selectedThread && (
        <div className="flex-1 overflow-y-auto p-8 bg-gray-50">
          {/* Story Header (if root is a story) */}
          {selectedThread.type === "story" && (
            <Card className="mb-6">
              <CardContent className="pt-6">
                <div className="mb-2">
                  <span className="text-xs font-semibold text-purple-600 uppercase">
                    YOUR POST
                  </span>
                  <span className="text-xs text-gray-500 ml-4">
                    {formatDate(selectedThread.time)}
                  </span>
                </div>

                <h1 className="text-2xl font-bold mb-2">
                  {selectedThread.url ? (
                    <a
                      href={selectedThread.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {selectedThread.title}
                    </a>
                  ) : (
                    selectedThread.title || "Discussion Thread"
                  )}
                </h1>

                {selectedThread.text && (
                  <div
                    className="prose max-w-none mt-4"
                    dangerouslySetInnerHTML={{ __html: selectedThread.text }}
                  />
                )}

                <div className="flex gap-4 text-sm text-gray-600 mt-4">
                  {selectedThread.score !== null && (
                    <span>{selectedThread.score} points</span>
                  )}
                  {selectedThread.descendants !== null && (
                    <span>{selectedThread.descendants} comments</span>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Chat-Style Conversation */}
          {conversationItems.length > 0 ? (
            <div className="space-y-1">
              {conversationItems.map((convItem) => (
                <ChatMessage
                  key={convItem.item.id}
                  item={convItem.item}
                  depth={convItem.depth}
                  isUserComment={convItem.isUserComment}
                  isReplyToUser={convItem.isReplyToUser}
                  selectedUser={selectedUser || ""}
                  formatDate={formatDate}
                  isUnread={convItem.item.is_read === 0}
                />
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center p-12">
              <div className="text-center text-gray-500">
                <p className="text-lg font-medium">No conversation to display</p>
                <p className="text-sm mt-2">
                  This thread may not have loaded completely yet.
                </p>
              </div>
            </div>
          )}

          {/* HN Link Footer */}
          <div className="mt-8 text-center">
            <a
              href={`https://news.ycombinator.com/item?id=${selectedThread.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline text-sm"
            >
              View full thread on HackerNews →
            </a>
          </div>
        </div>
      )}

      {!selectedThread && selectedUser && (
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="text-center p-8">
            <svg
              className="mx-auto h-16 w-16 text-gray-400 mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <h3 className="text-xl font-medium text-gray-900 mb-2">No item selected</h3>
            <p className="text-gray-600">Click on a post or comment to view details</p>
          </div>
        </div>
      )}

      {!selectedUser && (
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="text-center p-8">
            <svg
              className="mx-auto h-20 w-20 text-gray-400 mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
              />
            </svg>
            <h3 className="text-2xl font-semibold text-gray-900 mb-2">Welcome to HN Tracker</h3>
            <p className="text-gray-600 text-lg mb-4">Start tracking HackerNews users</p>
            <p className="text-gray-500 text-sm">Enter a username above to begin monitoring their activity</p>
          </div>
        </div>
      )}
    </div>
    </>
  );
}

export default App;
