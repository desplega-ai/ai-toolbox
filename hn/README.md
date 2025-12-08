# HackerNews User Activity Tracker

Track HackerNews users and get notified when they post or receive comments.

## Features

### Core Tracking
- **Track multiple HN users** - Monitor as many users as you want
- **Thread-based views** - Everything organized as conversation threads
- **Incremental syncing** - Background worker efficiently syncs new HN items
- **Detect new replies** - Get notified when posts/comments receive new replies
- **Read/unread tracking** - Mark items as read and track what's new
- **Item count tracking** - See total items tracked per user in the user list

### Content Views
- **Chat-style thread view** - Conversation interface with your comments on right, others on left
- **Focused conversation paths** - Only shows relevant context, not entire massive threads
- **Posts filter**: Your stories + all their reply threads
- **Comments filter**: Your comments + parent context + child replies
- **Split-view interface** - Browse threads on the left, chat view on the right
- **Persistent selection** - Selected thread stays highlighted while browsing

### User Experience
- **Chat-like bubbles** - Familiar messaging interface for easy conversation following
  - Your comments: Green bubbles, right-aligned
  - Replies to you: Blue bubbles, left-aligned
  - Context comments: Gray bubbles, left-aligned
- **Thread indentation** - Visual hierarchy shows reply structure (up to 8 levels)
- **Avatar circles** - User initials displayed in color-coded circles
- **Unread indicators** - Green rings + "NEW" badges on unread messages
- **Color-coded sidebar** - Posts (purple) and comment threads (green) are visually distinct
- **Toast notifications** - Get real-time feedback for all actions (sync, mark as read, errors)
- **URL-based navigation** - Deep linking support with query parameters
  - Share direct links to specific threads
  - Browser back/forward buttons work properly
  - Bookmarkable views
- **Enhanced empty states** - Clear, welcoming messages with icons when no content is selected
- **Last sync timestamp** - Always visible below username

## Quick Start

### Prerequisites
- Bun installed
- Redis server running (default: `localhost:6380`)
- PM2 installed globally: `bun add pm2 -g`

### Installation

```bash
bun install
```

### Development Mode

```bash
# Terminal 1: Web server with hot reload
bun run dev

# Terminal 2: Sync worker with hot reload
bun run dev:worker
```

Open http://localhost:3010 and add a HN username to start tracking.

### Production Mode (PM2)

```bash
# Start both web server and sync worker
bun run pm2:start

# View logs
bun run pm2:logs

# Check status
bun run pm2:status

# Stop all
bun run pm2:stop
```

## Interface Guide

### Thread Sidebar Color Coding
- **Purple theme**: Posts/Stories you created
- **Green theme**: Comment threads you participated in
- Unread threads have a light colored background (purple-50 or green-50)
- Selected threads have a darker background and colored left border
- Unread count badges shown on threads with new activity

### Chat View Color Coding
- **Green bubbles** (right): Your comments
- **Blue bubbles** (left): Replies to your comments
- **Gray bubbles** (left): Context comments (parent chain)
- **Green ring**: Unread messages
- **Avatar circles**: Green for you, gray for others

### User List
- Shows username with unread count badge (red)
- Displays total items tracked below username
- Click any user to view their activity
- Bordered cards for clear separation

### Controls
- **Sync button** (↻): Manually refresh user data, spins during sync
- **Mark All Read**: Bulk mark all items as read for current user
- **Back to Users** (← arrow): Return to user list
- **Posts/Comments tabs**: Filter view by content type

### URL Structure
- Base: `http://localhost:3010`
- User view: `?user=username&view=posts`
- Specific thread: `?user=username&view=posts&item=12345`

### How the Chat View Works

The chat interface builds a **focused conversation path** for each thread:

1. **For post threads**: Shows the story header + all direct replies in chat format
2. **For comment threads**: Shows:
   - Root story context (if it's a story)
   - Parent chain leading to your comment (gray bubbles, left)
   - Your comments (green bubbles, right)
   - Replies to your comments (blue bubbles, left)

This focused approach means you only see **relevant** parts of the conversation, not all 500+ comments in a popular HN thread. The algorithm:
- Builds upward chain from your comment to the root
- Builds downward chain of direct replies to you
- Merges and deduplicates shared context
- Sorts chronologically for natural flow
- Limits depth to 10 levels for performance

## Architecture

### Components

1. **Web Server** (`src/index.ts`)
   - Bun.serve() with React SPA
   - REST API for items and users
   - Runs on port 3010

2. **Sync Worker** (`src/sync-worker.ts`)
   - Background HN item syncing
   - Uses `/maxitem` API for incremental updates
   - Processes 100 items per batch every 60 seconds

3. **Frontend** (`src/App.tsx`)
   - React 19 with hooks (useState, useEffect, useMemo)
   - Thread sidebar navigation
   - Chat-style conversation view
   - Toast notifications with Sonner

4. **Conversation Builder** (`src/lib/conversation-builder.ts`)
   - Merges thread context, user comments, and replies
   - Builds focused conversation paths
   - Handles deep nesting and deduplication
   - Optimized with Map lookups

5. **Chat Components** (`src/components/ChatMessage.tsx`)
   - Memoized message bubbles
   - Left/right alignment logic
   - Color-coded based on author/context
   - Thread indentation support

6. **Database** (SQLite)
   - Tables: `tracked_users`, `items`
   - WAL mode for better concurrency

7. **Cache** (Redis)
   - Sync state coordination
   - Distributed locks
   - Last sync timestamps

### How Incremental Syncing Works

Instead of fetching each user's submissions separately:

1. Query HN's `/maxitem` endpoint for latest item ID
2. Compare with last synced ID (stored in Redis)
3. Fetch new items incrementally in batches of 100
4. Filter and store only items from tracked users
5. Update Redis state after each batch

This scales much better as you track more users.

## Tech Stack
- **Runtime**: Bun
- **Frontend**: React 19, Tailwind CSS 4
- **Database**: SQLite (bun:sqlite)
- **Cache**: Redis (Bun.redis)
- **Process Manager**: PM2
- **UI Components**: Radix UI, Sonner
- **API**: HackerNews Firebase API
