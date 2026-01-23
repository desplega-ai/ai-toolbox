import { getDb } from "./client.ts";
import type { Todo } from "./schema.ts";

export interface CreateTodoInput {
  text: string;
  project?: string;
  due_date?: string;
}

export interface ListTodosOptions {
  project?: string;
  status?: "open" | "done" | "cancelled" | "all";
}

/**
 * Create a new todo
 */
export async function createTodo(input: CreateTodoInput): Promise<Todo> {
  const db = await getDb();
  const now = new Date().toISOString();

  const result = await db.execute({
    sql: `INSERT INTO todos (project, text, status, due_date, created_at)
          VALUES (?, ?, 'open', ?, ?)`,
    args: [input.project ?? null, input.text, input.due_date ?? null, now],
  });

  return {
    id: Number(result.lastInsertRowid),
    project: input.project ?? null,
    text: input.text,
    status: "open",
    due_date: input.due_date ?? null,
    created_at: now,
    completed_at: null,
  };
}

/**
 * List todos with optional filtering
 */
export async function listTodos(options: ListTodosOptions = {}): Promise<Todo[]> {
  const db = await getDb();

  const conditions: string[] = [];
  const args: (string | null)[] = [];

  // Status filter
  if (options.status && options.status !== "all") {
    conditions.push("status = ?");
    args.push(options.status);
  } else if (!options.status) {
    // Default: only open todos
    conditions.push("status = ?");
    args.push("open");
  }

  // Project filter
  if (options.project) {
    conditions.push("project = ?");
    args.push(options.project);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await db.execute({
    sql: `SELECT * FROM todos ${whereClause} ORDER BY
          CASE WHEN due_date IS NULL THEN 1 ELSE 0 END,
          due_date ASC,
          created_at ASC`,
    args,
  });

  return result.rows.map((row) => ({
    id: row.id as number,
    project: row.project as string | null,
    text: row.text as string,
    status: row.status as "open" | "done" | "cancelled",
    due_date: row.due_date as string | null,
    created_at: row.created_at as string,
    completed_at: row.completed_at as string | null,
  }));
}

/**
 * Get a single todo by ID
 */
export async function getTodo(id: number): Promise<Todo | null> {
  const db = await getDb();

  const result = await db.execute({
    sql: "SELECT * FROM todos WHERE id = ?",
    args: [id],
  });

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  if (!row) return null;

  return {
    id: row.id as number,
    project: row.project as string | null,
    text: row.text as string,
    status: row.status as "open" | "done" | "cancelled",
    due_date: row.due_date as string | null,
    created_at: row.created_at as string,
    completed_at: row.completed_at as string | null,
  };
}

/**
 * Update a todo
 */
export async function updateTodo(
  id: number,
  updates: Partial<Pick<Todo, "text" | "project" | "due_date">>,
): Promise<Todo | null> {
  const db = await getDb();

  const existing = await getTodo(id);
  if (!existing) return null;

  const setClauses: string[] = [];
  const args: (string | null | number)[] = [];

  if (updates.text !== undefined) {
    setClauses.push("text = ?");
    args.push(updates.text);
  }
  if (updates.project !== undefined) {
    setClauses.push("project = ?");
    args.push(updates.project);
  }
  if (updates.due_date !== undefined) {
    setClauses.push("due_date = ?");
    args.push(updates.due_date);
  }

  if (setClauses.length === 0) {
    return existing;
  }

  args.push(id);

  await db.execute({
    sql: `UPDATE todos SET ${setClauses.join(", ")} WHERE id = ?`,
    args,
  });

  return getTodo(id);
}

/**
 * Mark a todo as completed
 */
export async function completeTodo(id: number): Promise<Todo | null> {
  const db = await getDb();
  const now = new Date().toISOString();

  const existing = await getTodo(id);
  if (!existing) return null;

  await db.execute({
    sql: "UPDATE todos SET status = 'done', completed_at = ? WHERE id = ?",
    args: [now, id],
  });

  return getTodo(id);
}

/**
 * Mark a todo as cancelled
 */
export async function cancelTodo(id: number): Promise<Todo | null> {
  const db = await getDb();
  const now = new Date().toISOString();

  const existing = await getTodo(id);
  if (!existing) return null;

  await db.execute({
    sql: "UPDATE todos SET status = 'cancelled', completed_at = ? WHERE id = ?",
    args: [now, id],
  });

  return getTodo(id);
}

/**
 * Delete a todo permanently
 */
export async function deleteTodo(id: number): Promise<boolean> {
  const db = await getDb();

  const existing = await getTodo(id);
  if (!existing) return false;

  await db.execute({
    sql: "DELETE FROM todos WHERE id = ?",
    args: [id],
  });

  return true;
}
