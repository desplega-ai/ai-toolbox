#!/usr/bin/env bun
/**
 * Read PR state, wait for changes, or request a review.
 *
 * Usage:
 *   bun pr-state.ts snapshot [--repo owner/name] [--pr N]
 *   bun pr-state.ts wait --since oid [--interval 60] [--timeout 2700] [--round N/M]
 *   bun pr-state.ts rerequest --reviewer login [--dry-run]
 * All commands accept --repo and --pr.
 * Only one wait runs per PR. Its lock file in the temp dir holds its pid.
 */

import { $ } from "bun";
import { linkSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  graphql,
  context,
  parseArgs,
  fetchThreads,
  fetchFindings,
  type Args,
  type ReviewThread,
} from "../../tackle-gh-comments/scripts/gh-pr-comments.ts";

type Context = Awaited<ReturnType<typeof context>>;
type Actor = {
  login: string;
  __typename: "User" | "Bot";
};
type Page<T> = {
  nodes: T[];
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
  };
};
type Comment = {
  id: string;
  author: Actor | null;
  body: string;
  createdAt: string;
  updatedAt?: string;
  originalCommit?: { oid: string } | null;
};
type Review = {
  id: string;
  author: Actor | null;
  body: string;
  submittedAt: string | null;
  updatedAt?: string;
  state: string;
  commit: { oid: string } | null;
};
type Check = {
  id: string;
  name: string;
  status: string;
  conclusion: string | null;
  required?: boolean;
};
type CheckContext = {
  __typename: string;
  id: string;
  name?: string;
  status?: string;
  conclusion?: string | null;
  context?: string;
  state?: string;
  isRequired?: boolean;
};
type Activity = {
  id: string;
  author: Actor;
  kind: "review" | "threadComment" | "comment";
  at: string;
  updatedAt?: string;
  body: string;
  commitOid: string | null;
  state: string | null;
};
type ThreadData<T = Comment> = {
  id: string;
  comments: Page<T>;
};
type WaitComment = {
  id: string;
  author: { login: string } | null;
  createdAt: string;
  updatedAt?: string;
};
type WaitReview = {
  id: string;
  author: { login: string } | null;
  submittedAt: string | null;
  updatedAt?: string;
};
type WaitActivity = {
  id: string;
  author: string;
  kind: Activity["kind"];
  at: string;
  updatedAt?: string;
};
type RequestedReviewer = {
  requestedReviewer?: Actor | null;
};

const REVIEW_SELECTION = "id author { login __typename } body submittedAt updatedAt state commit { oid }";
const COMMENT_SELECTION = "id author { login __typename } body createdAt updatedAt";
const THREAD_COMMENT_SELECTION = "id author { login __typename } body createdAt originalCommit { oid }";
const WAIT_REVIEW_SELECTION = "id author { login } submittedAt updatedAt";
const WAIT_COMMENT_SELECTION = "id author { login } createdAt updatedAt";
const WAIT_THREAD_COMMENT_SELECTION = "id author { login } createdAt";
const WAIT_THREAD_SELECTION = `id comments(first:100) {
  pageInfo { hasNextPage endCursor }
  nodes { ${WAIT_THREAD_COMMENT_SELECTION} }
}`;
const REVIEWER_SELECTION = `requestedReviewer {
  ... on User { login __typename }
  ... on Bot { login __typename }
}`;
const THREAD_SELECTION = `id comments(first:100) {
  pageInfo { hasNextPage endCursor }
  nodes { ${THREAD_COMMENT_SELECTION} }
}`;

async function pages<T>(ctx: Context, field: string, selection: string, extra = ""): Promise<T[]> {
  const nodes: T[] = [];
  let cursor: string | null = null;
  for (let count = 0; count < 20; count++) {
    const data = await graphql<{
      repository: { pullRequest: { connection: Page<T> } };
    }>(`
      query($owner:String!, $name:String!, $number:Int!, $cursor:String) {
        repository(owner:$owner, name:$name) {
          pullRequest(number:$number) {
            connection: ${field}(first:100, after:$cursor ${extra}) {
              pageInfo { hasNextPage endCursor }
              nodes { ${selection} }
            }
          }
        }
      }`, {
      ...ctx,
      cursor,
    });
    const connection = data.repository.pullRequest.connection;
    nodes.push(...connection.nodes);
    if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) return nodes;
    cursor = connection.pageInfo.endCursor;
  }
  throw new Error(`Pagination exceeded 20 pages for ${field}.`);
}

const STATE_QUERY = `
query($owner:String!, $name:String!, $number:Int!) {
  viewer { login }
  repository(owner:$owner, name:$name) {
    pullRequest(number:$number) {
      url state isDraft author { login } headRefOid baseRefName baseRefOid
      reviewDecision mergeStateStatus mergeable
      commits(last:1) { nodes { commit { committedDate } } }
    }
  }
}`;

const WAIT_STATE_QUERY = `
query($owner:String!, $name:String!, $number:Int!) {
  viewer { login }
  repository(owner:$owner, name:$name) {
    pullRequest(number:$number) {
      url state headRefOid mergeStateStatus mergeable
    }
  }
}`;

type StateData = {
  viewer: { login: string };
  repository: {
    pullRequest: {
      url: string;
      state: string;
      isDraft: boolean;
      author: { login: string } | null;
      headRefOid: string;
      baseRefName: string;
      baseRefOid: string;
      reviewDecision: string | null;
      mergeStateStatus: string;
      mergeable: string;
      commits: { nodes: { commit: { committedDate: string } }[] };
    };
  };
};

type WaitStateData = {
  viewer: { login: string };
  repository: {
    pullRequest: Pick<
      StateData["repository"]["pullRequest"],
      "url" | "state" | "headRefOid" | "mergeStateStatus" | "mergeable"
    >;
  };
};

function readState(ctx: Context): Promise<StateData>;
function readState(ctx: Context, wait: true): Promise<WaitStateData>;
async function readState(ctx: Context, wait = false): Promise<StateData | WaitStateData> {
  for (let attempt = 0; ; attempt++) {
    const data = await graphql<StateData | WaitStateData>(wait ? WAIT_STATE_QUERY : STATE_QUERY, ctx);
    const pr = data.repository.pullRequest;
    // GitHub computes the merge state lazily. UNKNOWN on an open PR can clear after a short delay.
    if (pr.state !== "OPEN" || pr.mergeStateStatus !== "UNKNOWN" || attempt === 3) return data;
    await Bun.sleep(2000);
  }
}

type BaseRules = {
  branchProtectionRule: { requiredStatusCheckContexts: string[] } | null;
  rules: {
    nodes: {
      repositoryRuleset: { enforcement: string } | null;
      parameters: { requiredStatusChecks?: { context: string }[] } | null;
    }[];
  } | null;
} | null;

// Required check names from the base branch rulesets, and from classic branch protection when the
// viewer can read it. GitHub hides classic protection from non-admins and returns null.
function requiredNames(base: BaseRules): Set<string> {
  const names = new Set(base?.branchProtectionRule?.requiredStatusCheckContexts ?? []);
  for (const rule of base?.rules?.nodes ?? []) {
    if (rule.repositoryRuleset && rule.repositoryRuleset.enforcement !== "ACTIVE") continue;
    for (const item of rule.parameters?.requiredStatusChecks ?? []) names.add(item.context);
  }
  return names;
}

async function readChecks(ctx: Context, wait = false): Promise<Check[]> {
  const required = wait ? "" : "isRequired(pullRequestNumber:$number)";
  const checks: Check[] = [];
  let names = new Set<string>();
  let cursor: string | null = null;
  // A required check that has not started yet is missing from the rollup. List it as pending.
  const withExpected = () => [
    ...checks.map((check) => names.has(check.name) ? { ...check, required: true } : check),
    ...[...names]
      .filter((name) => !checks.some((check) => check.name === name))
      .map((name) => ({ id: `expected:${name}`, name, status: "EXPECTED", conclusion: null, required: true })),
  ];
  for (let count = 0; count < 20; count++) {
    const data = await graphql<{
      repository: {
        pullRequest: {
          baseRef: BaseRules;
          commits: {
            nodes: {
              commit: { statusCheckRollup: { contexts: Page<CheckContext> } | null };
            }[];
          };
        };
      };
    }>(`
      query($owner:String!, $name:String!, $number:Int!, $cursor:String) {
        repository(owner:$owner, name:$name) {
          pullRequest(number:$number) {
            baseRef {
              branchProtectionRule { requiredStatusCheckContexts }
              rules(first:100) { nodes {
                repositoryRuleset { enforcement }
                parameters { ... on RequiredStatusChecksParameters { requiredStatusChecks { context } } }
              } }
            }
            commits(last:1) { nodes { commit { statusCheckRollup {
              contexts(first:100, after:$cursor) {
                pageInfo { hasNextPage endCursor }
                nodes {
                  __typename
                  ... on CheckRun { id name status conclusion ${required} }
                  ... on StatusContext { id context state ${required} }
                }
              }
            } } } }
          }
        }
      }`, {
      ...ctx,
      cursor,
    });
    if (!cursor) names = requiredNames(data.repository.pullRequest.baseRef);
    const connection = data.repository.pullRequest.commits.nodes[0]?.commit.statusCheckRollup?.contexts;
    if (!connection) return withExpected();
    for (const node of connection.nodes) {
      if (node.__typename === "StatusContext") {
        let status = "COMPLETED";
        let conclusion = node.state ?? null;
        if (node.state === "PENDING" || node.state === "EXPECTED") {
          status = "PENDING";
          conclusion = null;
        }
        checks.push({
          id: node.id,
          name: node.context!,
          status,
          conclusion,
          required: node.isRequired,
        });
      } else {
        checks.push({
          id: node.id,
          name: node.name!,
          status: node.status!,
          conclusion: node.conclusion ?? null,
          required: node.isRequired,
        });
      }
    }
    if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) return withExpected();
    cursor = connection.pageInfo.endCursor;
  }
  throw new Error("Pagination exceeded 20 pages for checks.");
}

async function remainingThreadComments<T>(
  threads: ThreadData<T>[],
  selection = THREAD_COMMENT_SELECTION,
): Promise<T[]> {
  const comments: T[] = [];
  for (const thread of threads) {
    let connection = thread.comments;
    for (let count = 1; ; count++) {
      comments.push(...connection.nodes);
      if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) break;
      if (count === 20) throw new Error("Pagination exceeded 20 pages for thread comments.");
      const page = await graphql<{ node: { comments: Page<T> } }>(`
        query($id:ID!, $cursor:String) {
          node(id:$id) { ... on PullRequestReviewThread {
            comments(first:100, after:$cursor) {
              pageInfo { hasNextPage endCursor }
              nodes { ${selection} }
            }
          } }
        }`, {
        id: thread.id,
        cursor: connection.pageInfo.endCursor,
      });
      connection = page.node.comments;
    }
  }
  return comments;
}

async function readThreadComments(threads: ReviewThread[]): Promise<Comment[]> {
  const comments: Comment[] = [];
  for (let offset = 0; offset < threads.length; offset += 100) {
    const data = await graphql<{ nodes: ThreadData[] }>(`
      query($ids:[ID!]!) {
        nodes(ids:$ids) { ... on PullRequestReviewThread { ${THREAD_SELECTION} } }
      }`, {
      ids: threads.slice(offset, offset + 100).map((thread) => thread.id),
    });
    comments.push(...await remainingThreadComments(data.nodes));
  }
  return comments;
}

function activitiesFor(reviews: Review[], comments: Comment[], threadComments: Comment[]): Activity[] {
  const activities: Activity[] = [];
  for (const review of reviews) {
    if (!review.author || !review.submittedAt) continue;
    activities.push({
      id: review.id,
      author: review.author,
      kind: "review",
      at: review.submittedAt,
      updatedAt: review.updatedAt,
      body: review.body,
      commitOid: review.commit?.oid ?? null,
      state: review.state,
    });
  }
  for (const [kind, collection] of [["comment", comments], ["threadComment", threadComments]] as const) {
    for (const comment of collection) {
      if (!comment.author) continue;
      activities.push({
        id: comment.id,
        author: comment.author,
        kind,
        at: comment.createdAt,
        updatedAt: comment.updatedAt,
        body: comment.body,
        commitOid: comment.originalCommit?.oid ?? null,
        state: null,
      });
    }
  }
  return activities.sort((a, b) => a.at.localeCompare(b.at));
}

async function readWaitState(ctx: Context) {
  const [data, reviews, comments, checks, threads] = await Promise.all([
    readState(ctx, true),
    pages<WaitReview>(ctx, "reviews", WAIT_REVIEW_SELECTION),
    pages<WaitComment>(ctx, "comments", WAIT_COMMENT_SELECTION),
    readChecks(ctx, true),
    pages<ThreadData<WaitComment>>(ctx, "reviewThreads", WAIT_THREAD_SELECTION),
  ]);
  const threadComments = await remainingThreadComments(threads, WAIT_THREAD_COMMENT_SELECTION);
  const activities: WaitActivity[] = [];
  for (const review of reviews) {
    if (!review.author || !review.submittedAt) continue;
    activities.push({
      id: review.id,
      author: review.author.login,
      kind: "review",
      at: review.submittedAt,
      updatedAt: review.updatedAt,
    });
  }
  for (const [kind, collection] of [["comment", comments], ["threadComment", threadComments]] as const) {
    for (const comment of collection) {
      if (!comment.author) continue;
      activities.push({
        id: comment.id,
        author: comment.author.login,
        kind,
        at: comment.createdAt,
        updatedAt: comment.updatedAt,
      });
    }
  }
  return {
    value: {
      ...data.repository.pullRequest,
      head: { oid: data.repository.pullRequest.headRefOid },
    },
    activities: activities.filter((activity) => activity.author !== data.viewer.login),
    checks,
  };
}

function pending(check: Check): boolean {
  return check.status !== "COMPLETED";
}

function failed(check: Check): boolean {
  return !pending(check) && !["SUCCESS", "NEUTRAL", "SKIPPED"].includes(check.conclusion ?? "");
}

function blocked(state: string): boolean {
  return ["BEHIND", "DIRTY", "CONFLICTING"].includes(state);
}

export async function snapshot(ctx: Context) {
  const [data, reviews, comments, checks, requested, events, threads, findings] = await Promise.all([
    readState(ctx),
    pages<Review>(ctx, "reviews", REVIEW_SELECTION),
    pages<Comment>(ctx, "comments", COMMENT_SELECTION),
    readChecks(ctx),
    pages<RequestedReviewer>(ctx, "reviewRequests", REVIEWER_SELECTION),
    pages<RequestedReviewer>(
      ctx,
      "timelineItems",
      `... on ReviewRequestedEvent { ${REVIEWER_SELECTION} }`,
      ", itemTypes:[REVIEW_REQUESTED_EVENT]",
    ),
    fetchThreads(ctx),
    fetchFindings(ctx),
  ]);
  const pr = data.repository.pullRequest;
  const viewer = data.viewer.login;
  const author = pr.author?.login ?? "(ghost)";
  const committedDate = pr.commits.nodes[0]?.commit.committedDate ?? null;
  const activities = activitiesFor(reviews, comments, await readThreadComments(threads));
  const accounts = new Map<string, Actor>();
  for (const activity of activities) accounts.set(activity.author.login, activity.author);
  for (const item of [...requested, ...events]) {
    if (item.requestedReviewer?.login) accounts.set(item.requestedReviewer.login, item.requestedReviewer);
  }
  const authorReview = reviews.find((review) => review.author?.login === author && review.body.trim());
  if (authorReview?.author) {
    accounts.set(author, authorReview.author);
  } else {
    accounts.delete(author);
  }
  accounts.delete(viewer);
  const reviewers = [...accounts.values()].map((account) => {
    const own = activities.filter((activity) => activity.author.login === account.login);
    const latest = own.at(-1);
    const latestReview = own.filter((activity) => activity.kind === "review" && activity.state !== "COMMENTED").at(-1);
    // A mention can use the full login or a login part with at least four characters.
    const login = account.login.replace(/\[bot\]$/i, "");
    const handles = [login, ...login.split("-").filter((part) => part.length >= 4)]
      .map((handle) => handle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const mentionPattern = new RegExp(
      `(?<![\\w.])@(?:${handles.join("|")})(?:\\[bot\\])?(?![a-z0-9_-]|\\.\\w|\\[bot\\])`,
      "i",
    );
    const trigger = latest ? activities.filter((activity) =>
      activity.kind !== "review" && activity.author.login !== account.login && activity.at < latest.at &&
      mentionPattern.test(activity.body),
    ).at(-1) : undefined;
    const excerptStart = trigger ? Math.max(0, trigger.body.search(mentionPattern) - 40) : 0;
    const latestBody = own.filter((activity) => activity.kind !== "threadComment" && activity.body.trim()).at(-1);
    return {
      login: account.login,
      type: account.__typename,
      isAuthor: account.login === author,
      requestedNow: requested.some((item) => item.requestedReviewer?.login === account.login),
      everRequested: events.some((item) => item.requestedReviewer?.login === account.login),
      counts: {
        reviews: own.filter((activity) => activity.kind === "review").length,
        threadComments: own.filter((activity) => activity.kind === "threadComment").length,
        comments: own.filter((activity) => activity.kind === "comment").length,
      },
      latest: latest ? {
        kind: latest.kind,
        at: latest.at,
        commitOid: latest.commitOid,
        onHead: latest.commitOid ? latest.commitOid === pr.headRefOid : !!committedDate && latest.at > committedDate,
        state: latest.state,
      } : null,
      approvedOnHead: latestReview?.state === "APPROVED" && latestReview.commitOid === pr.headRefOid,
      triggeredBy: trigger ? {
        author: trigger.author.login,
        at: trigger.at,
        excerpt: trigger.body.slice(excerptStart, excerptStart + 180),
      } : null,
      bodyTail: latestBody?.body.trim().slice(-300) ?? "",
    };
  });
  const required = checks.filter((check) => check.required);
  const publicCheck = ({ name, status, conclusion }: Check) => ({
    name,
    status,
    conclusion,
  });
  return {
    value: {
      repo: `${ctx.owner}/${ctx.name}`,
      number: ctx.number,
      url: pr.url,
      state: pr.state,
      isDraft: pr.isDraft,
      viewer,
      author,
      head: {
        oid: pr.headRefOid,
        committedDate,
      },
      base: {
        ref: pr.baseRefName,
        oid: pr.baseRefOid,
      },
      reviewDecision: pr.reviewDecision,
      mergeStateStatus: pr.mergeStateStatus,
      mergeable: pr.mergeable,
      checks: {
        required: required.map(publicCheck),
        optional: checks.filter((check) => !check.required).map(publicCheck),
        requiredCount: required.length,
      },
      threads: {
        unresolved: threads.filter((thread) => !thread.isResolved).length,
        total: threads.length,
      },
      findings: findings.map((finding) => ({
        ...finding,
        body: finding.body.slice(0, 300),
      })),
      reviewers,
      gates: {
        requiredChecksGreen: (required.length ? required : checks).every((check) => !pending(check) && !failed(check)),
        noUnresolvedThreads: threads.every((thread) => thread.isResolved),
        upToDate: !blocked(pr.mergeStateStatus) && !blocked(pr.mergeable),
        reviewDecisionOk: pr.reviewDecision === null || pr.reviewDecision === "APPROVED",
      },
    },
  };
}

type WaitState = Awaited<ReturnType<typeof readWaitState>>;
type FailedCheck = {
  name: string;
  conclusion: string | null;
};

export function lockPath(ctx: Context): string {
  return join(tmpdir(), "babysit-pr", `${ctx.owner}__${ctx.name}__${ctx.number}.lock`);
}

// True when the pid belongs to a running pr-state process. A reused pid of another program is false.
function waiting(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  const ps = Bun.spawnSync(["ps", "-p", String(pid), "-o", "command="]);
  return ps.exitCode === 0 && ps.stdout.toString().includes("pr-state");
}

// One wait per PR. Two waits would start two rounds from one event.
function lock(ctx: Context): () => void {
  const path = lockPath(ctx);
  mkdirSync(dirname(path), { recursive: true });
  // link() puts the lock in place with its pid already written, so no reader sees an empty file.
  const temp = `${path}.${process.pid}`;
  writeFileSync(temp, String(process.pid));
  try {
    for (;;) {
      try {
        linkSync(temp, path);
        return () => {
          try {
            if (readFileSync(path, "utf8") === String(process.pid)) rmSync(path);
          } catch {
            // Someone removed the lock already.
          }
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      let pid: number;
      try {
        pid = Number(readFileSync(path, "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      if (waiting(pid)) {
        throw new Error(
          `Another wait (pid ${pid}) watches ${ctx.owner}/${ctx.name}#${ctx.number}. Do not start a second wait. ` +
          `If you cannot find that background task, run \`kill ${pid}\` and start wait again.`,
        );
      }
      // No pr-state process holds this lock now.
      rmSync(path, { force: true });
    }
  } finally {
    rmSync(temp, { force: true });
  }
}

export async function waitForChange(ctx: Context, args: Args): Promise<void> {
  if (typeof args.since !== "string" || args.since.length < 7) {
    throw new Error("wait needs --since with at least seven characters.");
  }
  const release = lock(ctx);
  try {
    await watch(ctx, args, args.since);
  } finally {
    release();
  }
}

async function watch(ctx: Context, args: Args, since: string): Promise<void> {
  const seconds = (key: string, fallback: number) => {
    const value = args[key] === undefined ? fallback : Number(args[key]);
    if (!Number.isFinite(value) || value <= 0) throw new Error(`--${key} must be a positive number.`);
    return value * 1000;
  };
  const interval = seconds("interval", 60);
  const timeout = seconds("timeout", 2700);
  const started = Date.now();
  let readFailures = 0;
  const read = async (): Promise<WaitState> => {
    for (;;) {
      try {
        const result = await readWaitState(ctx);
        readFailures = 0;
        return result;
      } catch (error) {
        if (++readFailures === 3) throw error;
        await Bun.sleep(Math.min(interval, 1000 * 2 ** (readFailures - 1)));
      }
    }
  };
  const emit = (event: string, detail: unknown) => {
    const round = typeof args.round === "string" ? ` round ${args.round}` : "";
    console.log(JSON.stringify({
      event,
      detail,
      next: `babysit-pr${round} for ${ctx.owner}/${ctx.name}#${ctx.number}: run snapshot and continue the loop`,
    }));
  };
  const terminal = (current: WaitState): boolean => {
    if (current.value.state === "MERGED") {
      emit("merged", { url: current.value.url });
      return true;
    }
    if (current.value.state === "CLOSED") {
      emit("closed", { url: current.value.url });
      return true;
    }
    if (!current.value.head.oid.startsWith(since)) {
      emit("head-moved", current.value.head);
      return true;
    }
    return false;
  };
  let previous = await read();
  if (terminal(previous)) return;
  let settling: {
    activities: WaitState["activities"];
    failedChecks: FailedCheck[];
  } | null = null;
  for (;;) {
    const remaining = timeout - (Date.now() - started);
    if (!settling && remaining <= 0) {
      emit("timeout", { seconds: timeout / 1000 });
      return;
    }
    await Bun.sleep(settling ? interval : Math.min(interval, remaining));
    const current = await read();
    if (terminal(current)) return;
    const oldActivities = new Map(previous.activities.map((activity) => [activity.id, activity.updatedAt]));
    const newActivities = current.activities.filter((activity) =>
      !oldActivities.has(activity.id) || oldActivities.get(activity.id) !== activity.updatedAt,
    );
    const newFailedChecks = current.checks.filter((check) => failed(check) && !previous.checks.some((old) =>
      old.id === check.id && old.conclusion === check.conclusion && !pending(old),
    ));
    const details = {
      activities: [...settling?.activities ?? [], ...newActivities],
      failedChecks: [
        ...settling?.failedChecks ?? [],
        ...newFailedChecks.map(({ name, conclusion }) => ({
          name,
          conclusion,
        })),
      ],
    };
    if (settling) {
      emit("review-activity", details);
      return;
    }
    if (newActivities.length) {
      settling = details;
    } else if (newFailedChecks.length) {
      emit("check-failed", details.failedChecks);
      return;
    } else if (!current.checks.some(pending) && (
      previous.checks.some(pending) ||
      current.checks.some((check) => !previous.checks.some((old) => old.id === check.id))
    )) {
      emit("checks-done", { checks: current.checks.length });
      return;
    } else if (
      (previous.value.mergeStateStatus !== current.value.mergeStateStatus && blocked(current.value.mergeStateStatus)) ||
      (previous.value.mergeable !== current.value.mergeable && blocked(current.value.mergeable))
    ) {
      emit("merge-state", {
        mergeStateStatus: current.value.mergeStateStatus,
        mergeable: current.value.mergeable,
      });
      return;
    }
    previous = current;
  }
}

if (import.meta.main) {
  try {
    const argv = process.argv.slice(2);
    const { cmd, args } = parseArgs(argv.length ? argv : ["snapshot"]);
    switch (cmd) {
      case "snapshot": {
        console.log(JSON.stringify((await snapshot(await context(args))).value));
        break;
      }
      case "wait": {
        await waitForChange(await context(args), args);
        break;
      }
      case "rerequest": {
        if (typeof args.reviewer !== "string" || !args.reviewer) {
          throw new Error("rerequest needs --reviewer login.");
        }
        const ctx = await context(args);
        // @copilot is the gh CLI alias for this GitHub reviewer.
        const reviewer = /^copilot-pull-request-reviewer(?:\[bot\])?$/i.test(args.reviewer)
          ? "@copilot"
          : args.reviewer;
        const repo = `${ctx.owner}/${ctx.name}`;
        if (args["dry-run"] !== undefined) {
          const quote = (value: string) => /^[a-zA-Z0-9_@./-]+$/.test(value)
            ? value
            : `'${value.replace(/'/g, "'\\''")}'`;
          console.log(`gh pr edit ${ctx.number} --repo ${quote(repo)} --add-reviewer ${quote(reviewer)}`);
        } else {
          const result = await $`gh pr edit ${ctx.number} --repo ${repo} --add-reviewer ${reviewer}`.quiet().nothrow();
          if (result.exitCode !== 0) throw new Error(result.stderr.toString().trim());
        }
        break;
      }
      default:
        throw new Error(`Unknown command "${cmd}". See the header for usage.`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
