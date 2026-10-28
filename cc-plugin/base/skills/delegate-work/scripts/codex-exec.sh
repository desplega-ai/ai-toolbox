#!/usr/bin/env bash
#
# codex-exec.sh — invoke `codex exec` (non-interactive) for delegated
# implementation, review and judge work. This is the SINGLE SOURCE OF TRUTH
# for the invocation flags. The delegate-work skill calls only this script; its
# routing matrix decides WHICH gpt-6 variant (-m) and effort (-e) each task gets:
#   gpt-6-luna  = trivial/mechanical   gpt-6.1-sol = default (medium) to hard (high/xhigh)
#   gpt-6-astra = escalation only      effort: medium|high|xhigh|max (never ultra)
#
# Usage:
#   codex-exec.sh [-m <model>] [-e <effort>] -C <workdir> -o <last-message-file> [-l <log-file>] [-i <image>]... "PROMPT"
#   printf '%s' "$PROMPT" | codex-exec.sh -C <workdir> -o <file>     # prompt via stdin (preferred)
#   CODEX_SANDBOX=read-only codex-exec.sh -m gpt-6-astra -e xhigh -C <dir> \
#     -i <a.png> -i <b.png> -o <file> < prompt.md                    # judge or review, any dir
#
# Notes:
#   * -C sets codex's working root (the git worktree, for parallel isolation).
#   * -o writes codex's final message (its report) to a file you can read back.
#   * Reads the prompt from stdin when no positional PROMPT is given.
#   * -i attaches one image to the prompt. Repeat it for more images. A relative
#     path resolves against the caller's cwd. The script stops when a file is
#     missing or its path has a comma: codex drops a missing image without an
#     error, and it splits -i values on commas (both seen on codex-cli 0.163.0).
#   * In `exec` mode approvals are already "never", so nothing hangs waiting for
#     a human. The sandbox mode below bounds what codex may WRITE.
#
# Sandbox default: `workspace-write` — codex may freely edit files inside its
# working root (the worktree) and read elsewhere on disk (so it can read the
# plan by absolute path), but cannot write outside the workspace. This keeps
# parallel worktree runs from clobbering each other or the main tree.
#
# Git repo check: codex exec refuses a -C dir that is not in a git repo and not
# trusted in ~/.codex/config.toml. The check protects writes (git is the undo
# for codex edits). A read-only run writes nothing, so it always gets
# --skip-git-repo-check and runs in any dir (for example a /tmp dir of frames).
# Write modes keep the check: outside git, codex edits have no diff and no
# undo, and a non-git -C is usually a wrong path. A rule "skip only when -C is
# not in a git work tree" would equal "always skip", because the flag changes
# nothing inside a git repo.
#
# Env overrides (flags -m/-e take precedence):
#   CODEX_MODEL   default: gpt-6.1-sol          gpt-6.1-sol | gpt-6-astra | gpt-6-luna
#   CODEX_EFFORT  default: high                 reasoning effort (never "fast"/low)
#   CODEX_SANDBOX default: workspace-write      read-only | workspace-write | danger-full-access
#   CODEX_BYPASS  set to 1 to use --dangerously-bypass-approvals-and-sandbox
#                 (fully unsandboxed — opt in only when a phase must write
#                 outside its worktree; overrides CODEX_SANDBOX)
set -euo pipefail

WORKDIR="."
OUTFILE=""
LOGFILE=""
PROMPT=""
MODEL_FLAG=""
EFFORT_FLAG=""
IMAGES=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    -m|--model)  MODEL_FLAG="$2"; shift 2 ;;
    -e|--effort) EFFORT_FLAG="$2"; shift 2 ;;
    -C|--cd)  WORKDIR="$2"; shift 2 ;;
    -o|--out) OUTFILE="$2"; shift 2 ;;
    -l|--log) LOGFILE="$2"; shift 2 ;;
    -i|--image) IMAGES+=("$2"); shift 2 ;;
    --)       shift; PROMPT="${1:-}"; break ;;
    -*)       echo "codex-exec.sh: unknown flag: $1" >&2; exit 2 ;;
    *)        PROMPT="$1"; shift ;;
  esac
done

MODEL="${MODEL_FLAG:-${CODEX_MODEL:-gpt-6.1-sol}}"
EFFORT="${EFFORT_FLAG:-${CODEX_EFFORT:-high}}"
SANDBOX="${CODEX_SANDBOX:-workspace-write}"

# Images go first. codex's -i takes many values, so it would also take a
# positional prompt that follows it. The next flag (-m) ends the list.
# ${IMAGES[@]+...} keeps bash 3.2 (macOS) happy under `set -u` with no images.
args=( exec )
for img in ${IMAGES[@]+"${IMAGES[@]}"}; do
  [[ "$img" == /* ]] || img="$PWD/$img"
  if [[ ! -f "$img" || ! -r "$img" ]]; then
    echo "codex-exec.sh: image not found or not readable: $img" >&2; exit 2
  fi
  if [[ "$img" == *,* ]]; then
    echo "codex-exec.sh: image path has a comma (codex splits -i on commas): $img" >&2; exit 2
  fi
  args+=( -i "$img" )
done
args+=(
  -m "$MODEL"
  -c "model_reasoning_effort=\"$EFFORT\""
  -C "$WORKDIR"
)
if [[ "${CODEX_BYPASS:-0}" == "1" ]]; then
  args+=( --dangerously-bypass-approvals-and-sandbox )
else
  args+=( -s "$SANDBOX" )
  if [[ "$SANDBOX" == "read-only" ]]; then
    args+=( --skip-git-repo-check )   # see "Git repo check" above
  fi
fi
[[ -n "$OUTFILE" ]] && args+=( -o "$OUTFILE" )

# Prompt source: positional arg if present, otherwise stdin (`-`).
if [[ -n "$PROMPT" ]]; then
  set -- "$PROMPT"
else
  set -- "-"
fi

if [[ -n "$LOGFILE" ]]; then
  codex "${args[@]}" "$@" 2>&1 | tee "$LOGFILE"
else
  codex "${args[@]}" "$@"
fi
