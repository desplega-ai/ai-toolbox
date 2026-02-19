import { describe, expect, it } from "bun:test";
import {
  createComment,
  mapCommentsThroughChanges,
  parseAndStripComments,
  serializeComments,
} from "../src/comments";

describe("comment transforms", () => {
  it("parses and strips inline and line markers into clean content", () => {
    const raw = [
      "# Title",
      "",
      "Before <!-- review-start(c1d2e3f4) -->inline text<!-- review-end(c1d2e3f4): inline note --> after",
      "",
      "<!-- review-line-start(a1b2c3d4) -->",
      "| Name | Score |",
      "<!-- review-line-end(a1b2c3d4): row note -->",
      "",
    ].join("\n");

    const parsed = parseAndStripComments(raw);
    expect(parsed.cleanContent).toContain("Before inline text after");
    expect(parsed.cleanContent).toContain("| Name | Score |");
    expect(parsed.cleanContent.includes("review-start")).toBe(false);
    expect(parsed.cleanContent.includes("review-line-start")).toBe(false);

    expect(parsed.comments.length).toBe(2);
    expect(parsed.comments.map((comment) => comment.comment_type)).toEqual([
      "inline",
      "line",
    ]);
  });

  it("round-trips clean content and comments through serialization", () => {
    const clean = [
      "alpha beta gamma",
      "| Name | Score |",
      "| Alice | 10 |",
      "",
    ].join("\n");

    const comments = [
      createComment("inline", 6, 10, "inline note"),
      createComment("line", clean.indexOf("| Alice | 10 |"), clean.indexOf("| Alice | 10 |") + 13, "row note"),
    ];

    const serialized = serializeComments(clean, comments);
    const reparsed = parseAndStripComments(serialized);

    expect(reparsed.cleanContent).toBe(clean);
    expect(reparsed.comments.length).toBe(2);
    expect(reparsed.comments.map((comment) => comment.text)).toEqual([
      "inline note",
      "row note",
    ]);
  });

  it("maps comment ranges through edits", () => {
    const comment = createComment("inline", 5, 10, "note");
    const mapped = mapCommentsThroughChanges([comment], (pos) => pos + 3);

    expect(mapped.length).toBe(1);
    expect(mapped[0].highlight_start).toBe(8);
    expect(mapped[0].highlight_end).toBe(13);
  });
});
