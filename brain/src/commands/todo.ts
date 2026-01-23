import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import type { Todo } from "../db/schema.ts";
import {
  cancelTodo,
  completeTodo,
  createTodo,
  deleteTodo,
  getTodo,
  listTodos,
  updateTodo,
} from "../db/todos.ts";
import { openInEditor } from "../utils/editor.ts";

/**
 * Parse natural language dates to ISO format (YYYY-MM-DD)
 */
function parseDate(input: string): string {
  const today = new Date();
  const lowerInput = input.toLowerCase().trim();

  if (lowerInput === "today") {
    return formatDate(today);
  }

  if (lowerInput === "tomorrow") {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return formatDate(tomorrow);
  }

  if (lowerInput === "next week") {
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return formatDate(nextWeek);
  }

  // Check if it's already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return input;
  }

  throw new Error(
    `Invalid date format: ${input}. Use 'today', 'tomorrow', 'next week', or YYYY-MM-DD`,
  );
}

/**
 * Format a Date to YYYY-MM-DD
 */
function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Get relative display for due date
 */
function getRelativeDueDate(dueDate: string): {
  text: string;
  isOverdue: boolean;
  isDueToday: boolean;
} {
  const today = formatDate(new Date());
  const tomorrow = formatDate(new Date(Date.now() + 86400000));

  if (dueDate < today) {
    return { text: dueDate, isOverdue: true, isDueToday: false };
  }

  if (dueDate === today) {
    return { text: "today", isOverdue: false, isDueToday: true };
  }

  if (dueDate === tomorrow) {
    return { text: "tomorrow", isOverdue: false, isDueToday: false };
  }

  return { text: dueDate, isOverdue: false, isDueToday: false };
}

/**
 * Format a todo for display
 */
function formatTodo(todo: Todo, showStatus = false): string {
  const parts: string[] = [];

  // ID
  parts.push(chalk.dim(`#${todo.id}`));

  // Project
  if (todo.project) {
    parts.push(chalk.cyan(`[${todo.project}]`));
  }

  // Due date
  if (todo.due_date) {
    const { text, isOverdue, isDueToday } = getRelativeDueDate(todo.due_date);
    if (isOverdue) {
      parts.push(chalk.red(`(${text})`));
    } else if (isDueToday) {
      parts.push(chalk.yellow(`(${text})`));
    } else {
      parts.push(chalk.dim(`(${text})`));
    }
  }

  // Status indicator for completed/cancelled
  if (showStatus && todo.status !== "open") {
    if (todo.status === "done") {
      parts.push(chalk.green("[done]"));
    } else if (todo.status === "cancelled") {
      parts.push(chalk.dim("[cancelled]"));
    }
  }

  // Text
  if (todo.status === "done") {
    parts.push(chalk.strikethrough(chalk.dim(todo.text)));
  } else if (todo.status === "cancelled") {
    parts.push(chalk.dim(todo.text));
  } else {
    parts.push(todo.text);
  }

  return parts.join(" ");
}

export const todoCommand = new Command("todo").alias("t").description("Manage todos");

// brain todo add "text" [--project/-p] [--due/-d]
todoCommand
  .command("add")
  .argument("<text>", "Todo text")
  .option("-p, --project <name>", "Project scope")
  .option("-d, --due <date>", "Due date (today, tomorrow, next week, or YYYY-MM-DD)")
  .action(async (text: string, options: { project?: string; due?: string }) => {
    try {
      let dueDate: string | undefined;
      if (options.due) {
        dueDate = parseDate(options.due);
      }

      const todo = await createTodo({
        text,
        project: options.project,
        due_date: dueDate,
      });

      console.log(chalk.green("✓ Created todo"));
      console.log(formatTodo(todo));
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

// brain todo list [--project/-p] [--all/-a]
todoCommand
  .command("list")
  .alias("ls")
  .option("-p, --project <name>", "Filter by project")
  .option("-a, --all", "Include completed and cancelled")
  .action(async (options: { project?: string; all?: boolean }) => {
    try {
      const todos = await listTodos({
        project: options.project,
        status: options.all ? "all" : "open",
      });

      if (todos.length === 0) {
        if (options.all) {
          console.log(chalk.dim("No todos found"));
        } else {
          console.log(chalk.dim("No open todos"));
        }
        return;
      }

      for (const todo of todos) {
        console.log(formatTodo(todo, options.all));
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

// brain todo done <id...>
todoCommand
  .command("done")
  .argument("<ids...>", "Todo IDs to complete")
  .action(async (ids: string[]) => {
    try {
      for (const idStr of ids) {
        const id = parseInt(idStr, 10);
        if (Number.isNaN(id)) {
          console.error(chalk.red(`Invalid ID: ${idStr}`));
          continue;
        }

        const todo = await completeTodo(id);
        if (todo) {
          console.log(chalk.green(`✓ Completed #${id}`));
        } else {
          console.error(chalk.red(`Todo #${id} not found`));
        }
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

// brain todo cancel <id>
todoCommand
  .command("cancel")
  .argument("<id>", "Todo ID")
  .action(async (idStr: string) => {
    try {
      const id = parseInt(idStr, 10);
      if (Number.isNaN(id)) {
        console.error(chalk.red(`Invalid ID: ${idStr}`));
        process.exit(1);
      }

      const todo = await cancelTodo(id);
      if (todo) {
        console.log(chalk.green(`✓ Cancelled #${id}`));
      } else {
        console.error(chalk.red(`Todo #${id} not found`));
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

// brain todo edit <id>
todoCommand
  .command("edit")
  .argument("<id>", "Todo ID")
  .action(async (idStr: string) => {
    try {
      const id = parseInt(idStr, 10);
      if (Number.isNaN(id)) {
        console.error(chalk.red(`Invalid ID: ${idStr}`));
        process.exit(1);
      }

      const todo = await getTodo(id);
      if (!todo) {
        console.error(chalk.red(`Todo #${id} not found`));
        process.exit(1);
      }

      // Create a temp file with the todo text
      const tempPath = join(tmpdir(), `brain-todo-${id}-${Date.now()}.txt`);
      await Bun.write(tempPath, todo.text);

      // Open in editor
      console.log(chalk.dim("Opening in editor..."));
      await openInEditor(tempPath);

      // Read updated content
      const newText = (await Bun.file(tempPath).text()).trim();

      // Clean up temp file
      try {
        await unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }

      if (newText === todo.text) {
        console.log(chalk.dim("No changes"));
        return;
      }

      if (newText === "") {
        console.error(chalk.red("Error: Todo text cannot be empty"));
        process.exit(1);
      }

      await updateTodo(id, { text: newText });
      console.log(chalk.green(`✓ Updated #${id}`));

      const updated = await getTodo(id);
      if (updated) {
        console.log(formatTodo(updated));
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

// brain todo rm <id>
todoCommand
  .command("rm")
  .argument("<id>", "Todo ID")
  .action(async (idStr: string) => {
    try {
      const id = parseInt(idStr, 10);
      if (Number.isNaN(id)) {
        console.error(chalk.red(`Invalid ID: ${idStr}`));
        process.exit(1);
      }

      const deleted = await deleteTodo(id);
      if (deleted) {
        console.log(chalk.green(`✓ Deleted #${id}`));
      } else {
        console.error(chalk.red(`Todo #${id} not found`));
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });
