---
date: 2026-03-11T12:00:00Z
topic: "SQLite WAL, tmux send-keys, and Slug Generation for Pure Python Project"
---

# Research: SQLite WAL, tmux send-keys, Slug Generation

**Date**: 2026-03-11
**Context**: Pure Python (stdlib only) project needing concurrent SQLite access, tmux pane injection, and Docker-style slug generation.

---

## Topic 1: SQLite WAL Mode for Concurrent Access

### 1. Enabling WAL Mode

```python
import sqlite3

conn = sqlite3.connect("mydb.sqlite", timeout=30.0)
conn.execute("PRAGMA journal_mode=WAL")
```

- WAL mode is **persistent** on the database file itself. Once set, every subsequent connection uses WAL automatically. You only need to set it once (e.g., at DB creation time), but running it again is a harmless no-op.
- The pragma returns the string `"wal"` on success. If it fails (e.g., network filesystem), it returns the prior mode (e.g., `"delete"`).

### 2. Concurrency Guarantees

- **Readers never block writers. A writer never blocks readers.** This is the core WAL benefit.
- **Only ONE writer at a time.** SQLite uses a database-level write lock. A second writer must wait until the first writer's transaction commits or rolls back.
- Multiple processes can read simultaneously, even while a write is in progress. Each reader sees a consistent snapshot from the moment its transaction started.

### 3. Lock Timeout Settings

- Python's `sqlite3.connect()` has a `timeout` parameter (in seconds). **Default is 5.0 seconds.**
- When a writer can't acquire the write lock, SQLite retries internally until `timeout` expires, then raises `sqlite3.OperationalError: database is locked`.
- For 10-20 concurrent sessions, **30 seconds is generous**. SkyPilot uses 60s for 1000+ concurrent writers.
- The timeout uses an internal busy handler that sleeps with backoff, not a busy-spin.

```python
# Recommended for moderate concurrency (10-20 writers)
conn = sqlite3.connect("mydb.sqlite", timeout=30.0)
```

### 4. Connection Management

**Recommended approach: open/close per operation (short-lived connections)**

```python
import sqlite3
from contextlib import contextmanager

DB_PATH = "mydb.sqlite"

@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.execute("PRAGMA journal_mode=WAL")  # No-op if already WAL
    conn.execute("PRAGMA busy_timeout=30000")  # Alternative to connect timeout
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

# Usage
with get_db() as conn:
    conn.execute("INSERT INTO sessions (name) VALUES (?)", ("focused_turing",))
```

Why short-lived connections:
- Minimizes lock contention window
- Avoids stale connections across process forks
- WAL mode handles the concurrent-read case efficiently regardless
- Each connection is cheap to create for SQLite

For **read-heavy** code within a single process, keeping a connection open is fine. For **multi-process writers**, short transactions are critical.

### 5. macOS Gotchas

- **WAL works fine on macOS local filesystems** (APFS, HFS+). No issues with shared memory on local disk.
- **WAL does NOT work over network filesystems** (NFS, SMB, AFP). All processes must be on the same host. The WAL-index uses shared memory via `mmap()`, which requires a local filesystem.
- **No issues with macOS sandboxing** for CLI tools. Sandboxed macOS apps may have restrictions on shared memory, but this doesn't apply to Python CLI tools.
- **`-wal` and `-shm` files**: WAL mode creates two auxiliary files (`mydb.sqlite-wal` and `mydb.sqlite-shm`) alongside the database. Don't delete these while the database is in use. They're cleaned up automatically when the last connection closes cleanly.
- If a process crashes without closing its connection, the next connection that opens the database will automatically run recovery. This works correctly on macOS.

### Summary Table

| Aspect | Recommendation |
|--------|---------------|
| Enable WAL | `PRAGMA journal_mode=WAL` (once, at creation) |
| Timeout | `timeout=30.0` in `sqlite3.connect()` |
| Connections | Short-lived, open/close per operation |
| Transactions | Keep write transactions as short as possible |
| Max concurrent writers | Works for 10-20; tested up to 1000+ with high timeouts |
| Network FS | NOT supported; local filesystem only |

---

## Topic 2: tmux send-keys Escaping

### 1. How `send-keys -l` Handles Special Characters

**Without `-l` (default behavior):**
- tmux parses each argument as either a key name or literal characters
- Reserved words like `Enter`, `Escape`, `Tab`, `Space`, `Up`, `Down`, `F1`-`F12`, etc. are interpreted as special keys
- Unrecognized words are sent as character sequences
- Semicolons (`;`) are interpreted as tmux command separators -- this is a major gotcha

**With `-l` (literal mode):**
- ALL text is sent as literal characters. `Enter` becomes the 5 characters `E-n-t-e-r`, not a keypress.
- Semicolons, quotes, and most special characters are sent literally
- However, tmux's own command parser still runs BEFORE `-l` takes effect, so trailing semicolons can still cause issues at the tmux parsing level

### 2. Safe Python subprocess.run to tmux send-keys

**The golden rule: always use list-form `subprocess.run` (no `shell=True`).**

```python
import subprocess

def send_text_to_pane(target: str, text: str) -> None:
    """Send literal text to a tmux pane, then press Enter."""
    # Step 1: Send the text literally (no key-name interpretation)
    subprocess.run(
        ["tmux", "send-keys", "-t", target, "-l", text],
        check=True,
    )
    # Step 2: Send Enter as a separate command (NOT literal)
    subprocess.run(
        ["tmux", "send-keys", "-t", target, "Enter"],
        check=True,
    )
```

Why this works safely:
- `subprocess.run` with a list bypasses the shell entirely -- no shell expansion of `$`, backticks, quotes, etc.
- `-l` makes tmux treat the text as literal characters -- no key-name interpretation of words like `Enter` or `Escape`
- Sending `Enter` as a separate non-literal command ensures it's interpreted as the Enter keypress
- The text goes directly from Python string -> argv -> tmux, with no shell in between

### 3. Difference Between `send-keys` and `send-keys -l`

| Behavior | `send-keys` (default) | `send-keys -l` (literal) |
|----------|----------------------|-------------------------|
| `Enter` | Sends Enter keypress | Sends characters `E`, `n`, `t`, `e`, `r` |
| `Space` | Sends space character | Sends characters `S`, `p`, `a`, `c`, `e` |
| `C-c` | Sends Ctrl+C | Sends characters `C`, `-`, `c` |
| `ls -la` | Sends `ls-la` (space stripped!) | Sends `ls -la` (space preserved) |
| `echo $HOME` | Sends literally (no shell) | Sends literally (same) |

**Key insight**: Without `-l`, multiple unquoted arguments have spaces stripped. `send-keys foo bar` sends `foobar`. With `-l`, or with quoting (`send-keys "foo bar"`), spaces are preserved.

### 4. Sending Enter After Literal Text

Three approaches, from most to least recommended:

```python
# Approach A: Separate send-keys call (RECOMMENDED)
subprocess.run(["tmux", "send-keys", "-t", target, "-l", text], check=True)
subprocess.run(["tmux", "send-keys", "-t", target, "Enter"], check=True)

# Approach B: Hex mode for Enter (also good)
subprocess.run(["tmux", "send-keys", "-t", target, "-l", text], check=True)
subprocess.run(["tmux", "send-keys", "-t", target, "-H", "0a"], check=True)
# 0a = LF (newline), 0d = CR (Enter/Return) -- 0a is usually what you want

# Approach C: Append newline to literal text (simplest but subtle)
subprocess.run(["tmux", "send-keys", "-t", target, "-l", text + "\n"], check=True)
# This works because \n in literal mode sends an actual newline character
# which terminals interpret as Enter
```

**Approach A** is the clearest and most reliable. Two subprocess calls is negligible overhead.

### 5. Length Limits and Performance

- **No hard length limit** on `send-keys` text, but very long strings (>64KB) may hit OS `ARG_MAX` limits (`getconf ARG_MAX` on macOS = 1,048,576 bytes = ~1MB).
- For text over a few KB, consider writing to a temp file and using `tmux load-buffer` + `tmux paste-buffer` instead.
- Each `subprocess.run` call has ~5-10ms overhead. For sending many short snippets in a loop, batching is better.
- tmux processes send-keys synchronously -- the command doesn't return until the keys are delivered to the pane's terminal.

### Gotchas Summary

| Gotcha | Mitigation |
|--------|-----------|
| Semicolons parsed as tmux command separators | Use list-form subprocess (no shell) + `-l` flag |
| `Enter`/`Space`/`Tab` interpreted as keys | Use `-l` for text, separate call for Enter |
| Spaces stripped between arguments | Always quote text or use `-l` |
| Shell expansion of `$`, backticks | Use list-form subprocess (never `shell=True`) |
| Very long text hits ARG_MAX | Use `load-buffer` + `paste-buffer` for >100KB |

---

## Topic 3: Slug Generation (Docker-Style)

### 1. Docker's Word Lists

Docker's `namesgenerator` package (in `moby/moby` repo) uses:
- **108 adjectives** (e.g., `admiring`, `adoring`, `agitated`, `amazing`, `angry`, `awesome`, `blissful`, `bold`, `boring`, `brave`, `busy`, `charming`, `clever`, `compassionate`, `competent`, `condescending`, `confident`, `cool`, `cranky`, `crazy`, `dazzling`, `determined`, `dreamy`, `eager`, `ecstatic`, `elastic`, `elegant`, `eloquent`, `epic`, `exciting`, `fervent`, `festive`, `flamboyant`, `focused`, `friendly`, `frosty`, `funny`, `gallant`, `gifted`, `goofy`, `gracious`, `happy`, `hardcore`, `heuristic`, `hopeful`, `hungry`, `infallible`, `inspiring`, `intelligent`, `interesting`, `jolly`, `jovial`, `keen`, `kind`, `laughing`, `loving`, `lucid`, `magical`, `modest`, `musing`, `mystifying`, `naughty`, `nervous`, `nice`, `nifty`, `nostalgic`, `objective`, `optimistic`, `peaceful`, `pedantic`, `pensive`, `practical`, `priceless`, `quirky`, `quizzical`, `recursing`, `relaxed`, `reverent`, `romantic`, `sad`, `serene`, `sharp`, `silly`, `sleepy`, `stoic`, `strange`, `stupefied`, `suspicious`, `sweet`, `tender`, `thirsty`, `trusting`, `unruffled`, `upbeat`, `vibrant`, `vigilant`, `vigorous`, `wizardly`, `wonderful`, `xenodochial`, `youthful`, `zealous`, `zen`)
- **~235 notable scientists/hackers surnames** (e.g., `albattani`, `allen`, `babbage`, `curie`, `darwin`, `einstein`, `fermat`, `galileo`, `hopper`, `knuth`, `lovelace`, `newton`, `ritchie`, `stallman`, `turing`, `wozniak`, etc.)
- Easter egg: `boring_wozniak` is explicitly rejected and regenerated ("Steve Wozniak is not boring")
- Format: `{adjective}_{surname}` (e.g., `focused_turing`)
- On collision (retry > 0), appends a random digit 0-9: `focused_turing3`
- The package is **officially frozen** -- no new names will be added.

### 2. Pure Python Implementation

```python
import random

# Curated adjective list (Docker-inspired, trimmed for our needs)
ADJECTIVES = [
    "bold", "brave", "bright", "calm", "clever", "cool", "crisp",
    "daring", "eager", "epic", "fair", "fast", "fierce", "fresh",
    "gentle", "grand", "happy", "hardy", "keen", "kind", "lively",
    "lucid", "merry", "mighty", "neat", "noble", "prime", "proud",
    "quick", "quiet", "rapid", "sharp", "sleek", "smart", "solid",
    "steady", "still", "strong", "sunny", "swift", "tidy", "tough",
    "vivid", "warm", "wise", "witty", "zappy", "zen",
]

# Curated noun list (scientists/pioneers, or use thematic nouns)
NOUNS = [
    "albatross", "badger", "condor", "dolphin", "eagle", "falcon",
    "gazelle", "hawk", "ibis", "jaguar", "kestrel", "lynx",
    "mantis", "narwhal", "osprey", "panther", "quail", "raven",
    "shark", "tiger", "urchin", "viper", "wolf", "xerus", "yak",
]

def generate_slug() -> str:
    """Generate a Docker-style random slug like 'bold-falcon'."""
    adj = random.choice(ADJECTIVES)
    noun = random.choice(NOUNS)
    return f"{adj}-{noun}"
```

### 3. Uniqueness Math for 10-20 Concurrent Sessions

With the lists above:
- **48 adjectives x 25 nouns = 1,200 combinations**
- For 20 concurrent sessions, the probability of ANY collision (birthday problem):
  - P(collision) = 1 - (1200! / ((1200^20) * (1200-20)!))
  - Approximation: P ~= n^2 / (2*k) = 20^2 / (2*1200) = 400/2400 = **~16.7%**

That's too high for comfort. Options:

| List sizes | Combinations | P(collision) for n=20 |
|------------|-------------|----------------------|
| 48 adj x 25 nouns | 1,200 | ~16.7% |
| 48 adj x 50 nouns | 2,400 | ~8.3% |
| 100 adj x 50 nouns | 5,000 | ~4.0% |
| 100 adj x 100 nouns | 10,000 | ~2.0% |
| 48 adj x 25 nouns + digit | 12,000 | ~1.7% |

**Recommendation**: Use ~50 adjectives + ~50 nouns (2,500 combinations) plus a collision check. This is what Docker does -- check and retry.

### 4. Collision Avoidance Strategy

```python
import random

def generate_unique_slug(existing: set[str], max_retries: int = 10) -> str:
    """Generate a slug that doesn't collide with existing ones.

    Args:
        existing: Set of currently active slugs.
        max_retries: Max attempts before falling back to digit suffix.

    Returns:
        A unique slug string.
    """
    for _ in range(max_retries):
        slug = generate_slug()
        if slug not in existing:
            return slug

    # Fallback: append random digit (Docker's approach)
    slug = generate_slug()
    suffix = random.randint(0, 99)
    return f"{slug}-{suffix}"
```

For the use case of 10-20 concurrent sessions with 2,500+ combinations:
- A single retry loop almost always succeeds on first try
- The digit fallback is a safety net that should essentially never trigger
- No need for persistent storage of used names -- just check against currently active session names
- When a session ends, its slug becomes available again

### Alternative: Deterministic Approach

If you prefer zero collision risk and don't care about memorability as much:

```python
import random
import string

def generate_short_id(length: int = 6) -> str:
    """Generate a short random alphanumeric ID."""
    chars = string.ascii_lowercase + string.digits
    return ''.join(random.choices(chars, k=length))

# 36^6 = 2,176,782,336 combinations -- collision essentially impossible for <100 sessions
```

But the Docker-style `adjective-noun` format is far more human-friendly and memorable, which matters for session names.

---

## Sources

### SQLite WAL
- [SQLite WAL Official Documentation](https://sqlite.org/wal.html)
- [SkyPilot: Abusing SQLite to Handle Concurrency](https://blog.skypilot.co/abusing-sqlite-to-handle-concurrency/)
- [Sling Academy: Managing Concurrent Access in SQLite](https://www.slingacademy.com/article/managing-concurrent-access-in-sqlite-databases/)
- [Concurrent Writing with SQLite3 in Python](https://www.pythontutorials.net/blog/concurrent-writing-with-sqlite3/)

### tmux send-keys
- [tmux send-keys Blog Post](https://blog.damonkelley.me/2016/09/07/tmux-send-keys)
- [tmux send-keys Guide](https://tmuxai.dev/tmux-send-keys/)
- [tmux Issue #1849: Semicolons as command termination](https://github.com/tmux/tmux/issues/1849)
- [tmux Issue #1425: Space stripping](https://github.com/tmux/tmux/issues/1425)

### Docker Name Generator
- [Docker namesgenerator Go Package](https://pkg.go.dev/github.com/docker/docker/pkg/namesgenerator)
- [How Docker Generates Container Names](https://frightanic.com/computers/docker-default-container-names/)
- [Why boring_wozniak Will Never Be Generated](https://medium.com/peptr/why-boring-wozniak-will-never-be-generated-as-a-container-name-in-docker-763b755f9e2a)
