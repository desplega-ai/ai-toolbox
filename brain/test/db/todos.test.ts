import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDb, initDb } from "../../src/db/client.ts";
import {
  cancelTodo,
  completeTodo,
  createTodo,
  deleteTodo,
  getTodo,
  listTodos,
  updateTodo,
} from "../../src/db/todos.ts";

const TEST_DB_PATH = join(tmpdir(), `brain-test-todos-${Date.now()}.db`);

beforeAll(async () => {
  await initDb(TEST_DB_PATH);
});

afterAll(async () => {
  closeDb();
  try {
    await unlink(TEST_DB_PATH);
  } catch {
    // Ignore cleanup errors
  }
});

describe("createTodo", () => {
  test("creates a basic todo", async () => {
    const todo = await createTodo({ text: "Test todo" });

    expect(todo.id).toBeGreaterThan(0);
    expect(todo.text).toBe("Test todo");
    expect(todo.status).toBe("open");
    expect(todo.project).toBeNull();
    expect(todo.due_date).toBeNull();
    expect(todo.created_at).toBeTruthy();
    expect(todo.completed_at).toBeNull();
  });

  test("creates a todo with project", async () => {
    const todo = await createTodo({
      text: "Project todo",
      project: "ai-toolbox",
    });

    expect(todo.project).toBe("ai-toolbox");
  });

  test("creates a todo with due date", async () => {
    const todo = await createTodo({
      text: "Due date todo",
      due_date: "2026-01-25",
    });

    expect(todo.due_date).toBe("2026-01-25");
  });

  test("creates a todo with all options", async () => {
    const todo = await createTodo({
      text: "Full todo",
      project: "brain",
      due_date: "2026-02-01",
    });

    expect(todo.text).toBe("Full todo");
    expect(todo.project).toBe("brain");
    expect(todo.due_date).toBe("2026-02-01");
  });
});

describe("listTodos", () => {
  test("lists only open todos by default", async () => {
    // Create a mix of todos
    const open1 = await createTodo({ text: "Open 1" });
    const open2 = await createTodo({ text: "Open 2" });
    const done = await createTodo({ text: "Done todo" });
    await completeTodo(done.id);

    const todos = await listTodos();

    const ids = todos.map((t) => t.id);
    expect(ids).toContain(open1.id);
    expect(ids).toContain(open2.id);
    expect(ids).not.toContain(done.id);
  });

  test("lists all todos when status is 'all'", async () => {
    const open = await createTodo({ text: "Open for all" });
    const done = await createTodo({ text: "Done for all" });
    await completeTodo(done.id);

    const todos = await listTodos({ status: "all" });

    const ids = todos.map((t) => t.id);
    expect(ids).toContain(open.id);
    expect(ids).toContain(done.id);
  });

  test("filters by project", async () => {
    const proj1 = await createTodo({ text: "Project A todo", project: "proj-a" });
    const proj2 = await createTodo({ text: "Project B todo", project: "proj-b" });

    const todos = await listTodos({ project: "proj-a" });

    const ids = todos.map((t) => t.id);
    expect(ids).toContain(proj1.id);
    expect(ids).not.toContain(proj2.id);
  });

  test("filters by specific status", async () => {
    const cancelled = await createTodo({ text: "To cancel" });
    await cancelTodo(cancelled.id);

    const todos = await listTodos({ status: "cancelled" });

    const ids = todos.map((t) => t.id);
    expect(ids).toContain(cancelled.id);
  });

  test("orders by due date", async () => {
    const later = await createTodo({ text: "Later", due_date: "2026-12-31" });
    const earlier = await createTodo({ text: "Earlier", due_date: "2026-01-01" });
    const noDue = await createTodo({ text: "No due" });

    const todos = await listTodos({ status: "all" });

    // Find our test todos in order
    const ourTodos = todos.filter((t) =>
      [later.id, earlier.id, noDue.id].includes(t.id)
    );

    // Earlier due dates should come first, no due date last
    const earlierIdx = ourTodos.findIndex((t) => t.id === earlier.id);
    const laterIdx = ourTodos.findIndex((t) => t.id === later.id);
    const noDueIdx = ourTodos.findIndex((t) => t.id === noDue.id);

    expect(earlierIdx).toBeLessThan(laterIdx);
    expect(laterIdx).toBeLessThan(noDueIdx);
  });
});

describe("getTodo", () => {
  test("returns todo by ID", async () => {
    const created = await createTodo({ text: "Get me" });

    const todo = await getTodo(created.id);

    expect(todo).not.toBeNull();
    expect(todo?.text).toBe("Get me");
    expect(todo?.id).toBe(created.id);
  });

  test("returns null for non-existent ID", async () => {
    const todo = await getTodo(99999);
    expect(todo).toBeNull();
  });
});

describe("updateTodo", () => {
  test("updates todo text", async () => {
    const created = await createTodo({ text: "Original text" });

    const updated = await updateTodo(created.id, { text: "Updated text" });

    expect(updated?.text).toBe("Updated text");
  });

  test("updates todo project", async () => {
    const created = await createTodo({ text: "No project" });

    const updated = await updateTodo(created.id, { project: "new-project" });

    expect(updated?.project).toBe("new-project");
  });

  test("updates todo due_date", async () => {
    const created = await createTodo({ text: "No due" });

    const updated = await updateTodo(created.id, { due_date: "2026-03-15" });

    expect(updated?.due_date).toBe("2026-03-15");
  });

  test("returns null for non-existent ID", async () => {
    const updated = await updateTodo(99999, { text: "Won't work" });
    expect(updated).toBeNull();
  });

  test("returns unchanged todo if no updates", async () => {
    const created = await createTodo({ text: "No changes" });

    const updated = await updateTodo(created.id, {});

    expect(updated?.text).toBe("No changes");
  });
});

describe("completeTodo", () => {
  test("marks todo as done", async () => {
    const created = await createTodo({ text: "Complete me" });

    const completed = await completeTodo(created.id);

    expect(completed?.status).toBe("done");
    expect(completed?.completed_at).toBeTruthy();
  });

  test("returns null for non-existent ID", async () => {
    const completed = await completeTodo(99999);
    expect(completed).toBeNull();
  });
});

describe("cancelTodo", () => {
  test("marks todo as cancelled", async () => {
    const created = await createTodo({ text: "Cancel me" });

    const cancelled = await cancelTodo(created.id);

    expect(cancelled?.status).toBe("cancelled");
    expect(cancelled?.completed_at).toBeTruthy();
  });

  test("returns null for non-existent ID", async () => {
    const cancelled = await cancelTodo(99999);
    expect(cancelled).toBeNull();
  });
});

describe("deleteTodo", () => {
  test("deletes todo", async () => {
    const created = await createTodo({ text: "Delete me" });

    const deleted = await deleteTodo(created.id);

    expect(deleted).toBe(true);

    // Verify it's gone
    const todo = await getTodo(created.id);
    expect(todo).toBeNull();
  });

  test("returns false for non-existent ID", async () => {
    const deleted = await deleteTodo(99999);
    expect(deleted).toBe(false);
  });
});
