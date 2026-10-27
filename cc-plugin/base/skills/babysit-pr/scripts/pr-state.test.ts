import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { $ } from "bun";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const { snapshot, waitForChange, lockPath } = await import("./pr-state.ts");

const ctx = {
  owner: "fixture",
  name: "project",
  number: 123,
};
const head = "abcdef0123456789012345678901234567890123";
const oldHead = "1234567890123456789012345678901234567890";
const viewer = "viewer";
const author = "author";
const reviewer = "service-review-helper";
const createdAt = "2026-01-01T00:01:00Z";
const updatedAt = "2026-01-01T00:02:00Z";

function actor(login: string, type = "User") {
  return {
    login,
    __typename: type,
  };
}

function comment(id: string, login = reviewer, body = "Summary", at = createdAt) {
  return {
    id,
    author: actor(login, login === reviewer ? "Bot" : "User"),
    body,
    createdAt: at,
    updatedAt: at,
    url: `https://example.invalid/comments/${id}`,
    commit: { oid: head },
    originalCommit: { oid: head },
  };
}

function review(id: string, state = "COMMENTED", login = reviewer, body = "Review", at = createdAt) {
  return {
    id,
    author: actor(login, login === reviewer ? "Bot" : "User"),
    body,
    state,
    submittedAt: at,
    updatedAt: at,
    url: `https://example.invalid/reviews/${id}`,
    commit: { oid: head },
  };
}

function check(id: string, status = "COMPLETED", conclusion: string | null = "SUCCESS", required = true) {
  return {
    __typename: "CheckRun",
    id,
    name: `Check ${id}`,
    status,
    conclusion,
    isRequired: required,
  };
}

function page<T>(nodes: T[], hasNextPage = false, endCursor: string | null = null) {
  return {
    nodes,
    pageInfo: {
      hasNextPage,
      endCursor,
    },
  };
}

function thread(comments: ReturnType<typeof comment>[]) {
  return {
    id: "thread-1",
    isResolved: false,
    isOutdated: false,
    path: "file.ts",
    line: 1,
    comments: page(comments),
  };
}

type Frame = {
  state?: string;
  head?: string;
  author?: string;
  mergeStateStatus?: string;
  mergeable?: string;
  reviews?: ReturnType<typeof review>[];
  comments?: ReturnType<typeof comment>[];
  threads?: ReturnType<typeof thread>[];
  checks?: ReturnType<typeof check>[];
  noRollup?: boolean;
  rules?: { enforcement: string; names: string[] }[];
  classic?: string[];
};

let frames: Frame[];
let poll: number;
let stateCalls: number;
let stateFailures: number;
let queries: string[];
let pageMode: "normal" | "null-cursor" | "endless";
let commentPages: number;
let now: number;
let output: ReturnType<typeof spyOn>;
let tokenLookup: ReturnType<typeof spyOn>;
let clock: ReturnType<typeof spyOn>;
let sleep: ReturnType<typeof spyOn>;
const originalFetch = globalThis.fetch;

function stateData(frame: Frame) {
  return {
    viewer: { login: viewer },
    repository: {
      pullRequest: {
        url: "https://example.invalid/pr/123",
        state: frame.state ?? "OPEN",
        isDraft: false,
        author: actor(frame.author ?? author),
        headRefOid: frame.head ?? head,
        baseRefName: "main",
        baseRefOid: oldHead,
        reviewDecision: null,
        mergeStateStatus: frame.mergeStateStatus ?? "CLEAN",
        mergeable: frame.mergeable ?? "MERGEABLE",
        commits: {
          nodes: [{ commit: { committedDate: "2026-01-01T00:00:00Z" } }],
        },
        reviews: { nodes: frame.reviews ?? [] },
        comments: { nodes: frame.comments ?? [] },
      },
    },
  };
}

beforeEach(() => {
  frames = [{}];
  poll = -1;
  stateCalls = 0;
  stateFailures = 0;
  queries = [];
  pageMode = "normal";
  commentPages = 0;
  now = 0;
  clock = spyOn(Date, "now").mockImplementation(() => now);
  sleep = spyOn(Bun, "sleep").mockImplementation(async (duration) => {
    now += Number(duration);
  });
  tokenLookup = spyOn($.ShellPromise.prototype, "text").mockResolvedValue("fixture-token");
  output = spyOn(console, "log").mockImplementation(() => {});
  globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
    expect(String(input)).toBe("https://api.github.com/graphql");
    expect((init?.headers as Record<string, string>).Authorization).toBe("bearer fixture-token");
    const request = JSON.parse(String(init?.body));
    const query = request.query as string;
    queries.push(query);
    let data: unknown;
    if (query.includes("mergeStateStatus")) {
      stateCalls++;
      if (stateFailures > 0) {
        stateFailures--;
        return Response.json({ errors: [{ message: "Transient fixture failure" }] });
      }
      poll++;
      data = stateData(frames[Math.min(poll, frames.length - 1)]!);
    } else {
      const frame = frames[Math.min(Math.max(poll, 0), frames.length - 1)]!;
      if (query.includes("statusCheckRollup")) {
        data = {
          repository: {
            pullRequest: {
              commits: {
                nodes: [{ commit: { statusCheckRollup: frame.noRollup ? null : { contexts: page(frame.checks ?? []) } } }],
              },
              baseRef: {
                branchProtectionRule: frame.classic ? { requiredStatusCheckContexts: frame.classic } : null,
                rules: {
                  nodes: (frame.rules ?? []).map((rule) => ({
                    repositoryRuleset: { enforcement: rule.enforcement },
                    parameters: { requiredStatusChecks: rule.names.map((context) => ({ context })) },
                  })),
                },
              },
            },
          },
        };
      } else if (query.includes("reviews(last:50)")) {
        data = stateData(frame);
      } else if (query.includes("connection: reviews(")) {
        data = { repository: { pullRequest: { connection: page(frame.reviews ?? []) } } };
      } else if (query.includes("connection: comments(")) {
        commentPages++;
        const more = pageMode !== "normal";
        const cursor = pageMode === "endless" ? String(commentPages) : null;
        data = { repository: { pullRequest: { connection: page(frame.comments ?? [], more, cursor) } } };
      } else if (query.includes("connection: reviewThreads(")) {
        data = { repository: { pullRequest: { connection: page(frame.threads ?? []) } } };
      } else if (query.includes("connection: reviewRequests(") || query.includes("connection: timelineItems(")) {
        data = { repository: { pullRequest: { connection: page([]) } } };
      } else if (query.includes("reviewThreads(first:50")) {
        data = { repository: { pullRequest: { reviewThreads: page(frame.threads ?? []) } } };
      } else if (query.includes("nodes(ids:$ids)")) {
        data = { nodes: frame.threads ?? [] };
      } else if (query.includes("node(id:$id)")) {
        data = { node: { comments: page([]) } };
      } else {
        throw new Error(`Unexpected GraphQL query: ${query}`);
      }
    }
    return Response.json({ data });
  }) as typeof fetch;
});

afterEach(() => {
  rmSync(lockPath(ctx), { force: true });
  globalThis.fetch = originalFetch;
  output.mockRestore();
  tokenLookup.mockRestore();
  clock.mockRestore();
  sleep.mockRestore();
});

async function wait(args: Record<string, string> = {}) {
  await waitForChange(ctx, {
    since: head,
    interval: "0.005",
    timeout: "0.05",
    ...args,
  });
  expect(output).toHaveBeenCalledTimes(1);
  return JSON.parse(String(output.mock.calls[0]![0]));
}

test("settles two activity polls into one event and omits snapshot-only queries", async () => {
  const first = comment("summary");
  frames = [{}, { comments: [first] }, { comments: [first], threads: [thread([comment("reply")])] }];
  const event = await wait({ timeout: "0.006" });
  expect(event.event).toBe("review-activity");
  expect(event.detail.activities).toHaveLength(2);
  expect(stateCalls).toBe(3);
  expect(now).toBe(10);
  expect(queries.some((query) => /reviews\(last:|reviewRequests\(|timelineItems\(/.test(query))).toBe(false);
  expect(queries.filter((query) => query.includes("connection: reviewThreads(")).length).toBe(3);
  expect(queries.some((query) => query.includes("nodes(ids:$ids)"))).toBe(false);
  for (const query of queries) {
    expect(query).not.toMatch(
      /\b(body|originalCommit|isRequired|baseRefName|baseRefOid|isDraft|reviewDecision|committedDate)\b/,
    );
    if (!query.includes("statusCheckRollup")) expect(query).not.toMatch(/\b(commit|__typename)\b/);
    if (query.includes("connection: reviews(")) expect(query).not.toMatch(/\bstate\b/);
  }
});

test("ignores all viewer activity", async () => {
  frames = [{}, {
    reviews: [review("own-review", "COMMENTED", viewer)],
    comments: [comment("own-comment", viewer)],
    threads: [thread([comment("own-reply", viewer)])],
  }];
  expect((await wait()).event).toBe("timeout");
});

test("detects an edited issue comment with an existing id", async () => {
  const initial = comment("summary");
  frames = [{ comments: [initial] }, { comments: [{ ...initial, updatedAt }] }];
  const event = await wait();
  expect(event.event).toBe("review-activity");
  expect(event.detail.activities[0].id).toBe("summary");
  expect(queries.some((query) => query.includes("connection: comments(") && query.includes("updatedAt"))).toBe(true);
});

test("detects an edited review with an existing id", async () => {
  const initial = review("review");
  frames = [{ reviews: [initial] }, { reviews: [{ ...initial, updatedAt }] }];
  expect((await wait()).event).toBe("review-activity");
});

test("detects a newly failing check", async () => {
  frames = [
    { checks: [check("ci", "IN_PROGRESS", null)] },
    { checks: [check("ci", "COMPLETED", "FAILURE")] },
  ];
  expect((await wait()).event).toBe("check-failed");
});

test("does not repeat a check failure already present at baseline", async () => {
  frames = [{ checks: [check("ci", "COMPLETED", "FAILURE")] }];
  expect((await wait()).event).toBe("timeout");
});

test("detects pending checks becoming complete", async () => {
  frames = [{ checks: [check("ci", "IN_PROGRESS", null)] }, { checks: [check("ci")] }];
  expect((await wait()).event).toBe("checks-done");
});

test("detects checks that appeared and completed between polls", async () => {
  frames = [{}, { checks: [check("ci")] }];
  expect((await wait()).event).toBe("checks-done");
});

test("does not report unchanged complete checks", async () => {
  frames = [{ checks: [check("ci")] }];
  expect((await wait()).event).toBe("timeout");
});

test("detects a blocked merge state", async () => {
  frames = [{}, { mergeStateStatus: "BEHIND" }];
  expect((await wait()).event).toBe("merge-state");
});

test("accepts an abbreviated oid and detects a later head change", async () => {
  frames = [{}, { head: oldHead }];
  expect((await wait({ since: head.slice(0, 7) })).event).toBe("head-moved");
  expect(stateCalls).toBe(2);
});

test("rejects an oid shorter than seven characters", async () => {
  await expect(waitForChange(ctx, { since: "abcdef", interval: "0.005" })).rejects.toThrow();
  expect(stateCalls).toBe(0);
});

test("reports an already merged PR without retrying UNKNOWN", async () => {
  frames = [{ state: "MERGED", mergeStateStatus: "UNKNOWN" }];
  expect((await wait()).event).toBe("merged");
  expect(stateCalls).toBe(1);
});

test("times out with one instruction containing the round", async () => {
  const event = await wait({ round: "3/6" });
  expect(event.event).toBe("timeout");
  expect(event.next).toBe("babysit-pr round 3/6 for fixture/project#123: run snapshot and continue the loop");
});

test("throws after three consecutive transient errors", async () => {
  stateFailures = 3;
  await expect(waitForChange(ctx, { since: head, interval: "0.005" })).rejects.toThrow("Transient fixture failure");
  expect(stateCalls).toBe(3);
  expect(output).not.toHaveBeenCalled();
});

test("recovers from transient errors", async () => {
  stateFailures = 2;
  frames = [{}, { checks: [check("ci")] }];
  expect((await wait()).event).toBe("checks-done");
  expect(stateCalls).toBe(4);
});

test("preserves approval after a later COMMENTED review", async () => {
  frames = [{ reviews: [
    review("approval", "APPROVED"),
    review("later", "COMMENTED", reviewer, "More information", updatedAt),
  ] }];
  const result = await snapshot(ctx);
  expect(result.value.reviewers[0]!.approvedOnHead).toBe(true);
});

test("keeps an author with a non-empty review and adds isAuthor to every reviewer", async () => {
  frames = [{ reviews: [
    review("author-review", "COMMENTED", author),
    review("other-review"),
    review("viewer-review", "COMMENTED", viewer),
  ] }];
  const result = await snapshot(ctx);
  expect(result.value.reviewers.map((item) => [item.login, item.isAuthor])).toEqual([
    [author, true],
    [reviewer, false],
  ]);
});

test("excludes an author without a non-empty review and always excludes the viewer", async () => {
  frames = [{
    reviews: [review("empty", "COMMENTED", author, "  ")],
    comments: [comment("author-comment", author)],
  }];
  expect((await snapshot(ctx)).value.reviewers).toEqual([]);
  frames = [{ author: viewer, reviews: [review("own", "COMMENTED", viewer)] }];
  poll = -1;
  expect((await snapshot(ctx)).value.reviewers).toEqual([]);
});

test("uses originalCommit for thread freshness and preserves a non-thread footer", async () => {
  const reply = {
    ...comment("reply", reviewer, "Thread reply", updatedAt),
    originalCommit: { oid: oldHead },
  };
  frames = [{
    reviews: [review("review", "COMMENTED", reviewer, "  Review footer  ")],
    threads: [thread([reply])],
  }];
  const result = await snapshot(ctx);
  const account = result.value.reviewers[0]!;
  expect(account.latest?.onHead).toBe(false);
  expect(account.latest?.commitOid).toBe(oldHead);
  expect(account.bodyTail).toBe("Review footer");
  expect(queries.some((query) => query.includes("originalCommit { oid }"))).toBe(true);
});

test("matches short login parts without matching email addresses or domains", async () => {
  frames = [{
    reviews: [review("review", "COMMENTED", reviewer, "Review", "2026-01-01T00:10:00Z")],
    comments: [
      comment("valid", author, "@REVIEW[bot] please review", "2026-01-01T00:01:00Z"),
      comment("email", author, "x@review.sh", "2026-01-01T00:02:00Z"),
      comment("domain", author, "@review.sh", "2026-01-01T00:03:00Z"),
      comment("dot", author, "prefix.@review", "2026-01-01T00:04:00Z"),
      comment("bot-domain", author, "@review[bot].sh", "2026-01-01T00:05:00Z"),
    ],
  }];
  expect((await snapshot(ctx)).value.reviewers[0]!.triggeredBy?.excerpt).toBe("@REVIEW[bot] please review");
});

test("uses optional checks when there are no required checks", async () => {
  frames = [{ checks: [check("optional", "COMPLETED", "FAILURE", false)] }];
  const result = await snapshot(ctx);
  expect(result.value.checks.requiredCount).toBe(0);
  expect(result.value.gates.requiredChecksGreen).toBe(false);
});

test("stops a pagination connection with a missing cursor", async () => {
  pageMode = "null-cursor";
  await snapshot(ctx);
  expect(commentPages).toBe(1);
});

test("rejects a pagination connection exceeding twenty pages", async () => {
  pageMode = "endless";
  await expect(snapshot(ctx)).rejects.toThrow(/20/);
  expect(commentPages).toBe(20);
});

test("lists active required checks from the base rules that have not started", async () => {
  frames = [{
    checks: [check("lint", "COMPLETED", "SUCCESS", false)],
    rules: [
      { enforcement: "ACTIVE", names: ["Gate", "Check lint"] },
      { enforcement: "EVALUATE", names: ["Trial"] },
    ],
    classic: ["Legacy"],
  }];
  const result = await snapshot(ctx);
  expect(result.value.checks.required).toEqual([
    { name: "Check lint", status: "COMPLETED", conclusion: "SUCCESS" },
    { name: "Legacy", status: "EXPECTED", conclusion: null },
    { name: "Gate", status: "EXPECTED", conclusion: null },
  ]);
  expect(result.value.checks.optional).toEqual([]);
  expect(result.value.gates.requiredChecksGreen).toBe(false);
});

test("lists required checks when the head has no check rollup", async () => {
  frames = [{ noRollup: true, rules: [{ enforcement: "ACTIVE", names: ["Gate"] }] }];
  const result = await snapshot(ctx);
  expect(result.value.checks.requiredCount).toBe(1);
  expect(result.value.gates.requiredChecksGreen).toBe(false);
});

test("waits for a required check that has not started before checks-done", async () => {
  const rules = [{ enforcement: "ACTIVE", names: ["Check gate"] }];
  const lint = check("lint");
  frames = [
    { checks: [], rules },
    { checks: [lint], rules },
    { checks: [lint, check("gate", "IN_PROGRESS", null)], rules },
    { checks: [lint, check("gate")], rules },
  ];
  expect((await wait()).event).toBe("checks-done");
  expect(stateCalls).toBe(4);
});

test("refuses a second wait while a pr-state process holds the lock", async () => {
  const holder = Bun.spawn([process.execPath, "-e", "setTimeout(() => {}, 30000)", "pr-state-lock-fixture"]);
  try {
    mkdirSync(dirname(lockPath(ctx)), { recursive: true });
    writeFileSync(lockPath(ctx), String(holder.pid));
    await expect(waitForChange(ctx, { since: head, interval: "0.005" })).rejects.toThrow(
      `Another wait (pid ${holder.pid})`,
    );
    expect(stateCalls).toBe(0);
    expect(readFileSync(lockPath(ctx), "utf8")).toBe(String(holder.pid));
  } finally {
    holder.kill();
  }
});

test.each([
  ["an empty file", () => ""],
  ["a pid that does not run", () => "99999999"],
  ["a live pid of another program", (other: number) => String(other)],
])("replaces a lock with %s and removes it at the end", async (_label, content) => {
  const other = Bun.spawn([process.execPath, "-e", "setTimeout(() => {}, 30000)"]);
  try {
    mkdirSync(dirname(lockPath(ctx)), { recursive: true });
    writeFileSync(lockPath(ctx), content(other.pid));
    expect((await wait()).event).toBe("timeout");
    expect(existsSync(lockPath(ctx))).toBe(false);
  } finally {
    other.kill();
  }
});

test("removes the lock when wait fails", async () => {
  stateFailures = 3;
  await expect(waitForChange(ctx, { since: head, interval: "0.005" })).rejects.toThrow("Transient fixture failure");
  expect(existsSync(lockPath(ctx))).toBe(false);
});
