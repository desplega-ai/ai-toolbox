import { type Client, createClient } from "@libsql/client";
import { getDbPath } from "../config/index.ts";
import { CREATE_SCHEMA, CREATE_VECTOR_INDEX, SCHEMA_VERSION } from "./schema.ts";

let client: Client | null = null;
let migrationChecked = false;

/**
 * Schema migrations
 */
const MIGRATIONS: Record<number, string> = {
  // v1 -> v2: Add todos table
  2: `
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY,
      project TEXT,
      text TEXT NOT NULL,
      status TEXT DEFAULT 'open',
      due_date TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS todos_status_idx ON todos(status);
    CREATE INDEX IF NOT EXISTS todos_project_idx ON todos(project);
  `,
};

/**
 * Run pending migrations
 */
async function runMigrations(db: Client): Promise<void> {
  if (migrationChecked) return;
  migrationChecked = true;

  // Get current schema version
  const result = await db.execute("SELECT value FROM metadata WHERE key = 'schema_version'");
  const currentVersion = result.rows.length > 0 ? parseInt(result.rows[0]?.value as string, 10) : 1;

  if (currentVersion >= SCHEMA_VERSION) return;

  // Run migrations sequentially
  for (let v = currentVersion + 1; v <= SCHEMA_VERSION; v++) {
    const migration = MIGRATIONS[v];
    if (migration) {
      await db.executeMultiple(migration);
    }
  }

  // Update schema version
  await db.execute({
    sql: "INSERT OR REPLACE INTO metadata (key, value) VALUES ('schema_version', ?)",
    args: [String(SCHEMA_VERSION)],
  });
}

/**
 * Get the database client singleton
 * Initializes on first call
 */
export async function getDb(): Promise<Client> {
  if (client) {
    return client;
  }

  const dbPath = await getDbPath();
  if (!dbPath) {
    throw new Error("Brain not initialized. Run 'brain init' first.");
  }

  client = createClient({
    url: `file:${dbPath}`,
  });

  // Run any pending migrations
  await runMigrations(client);

  return client;
}

/**
 * Initialize the database with schema
 * Safe to call multiple times
 */
export async function initDb(dbPath: string): Promise<void> {
  const db = createClient({
    url: `file:${dbPath}`,
  });

  // Create main schema
  await db.executeMultiple(CREATE_SCHEMA);

  // Try to create vector index (may fail without libSQL extensions)
  try {
    await db.execute(CREATE_VECTOR_INDEX);
  } catch {
    // Vector index not supported, that's OK for basic functionality
  }

  // Set schema version
  await db.execute({
    sql: "INSERT OR REPLACE INTO metadata (key, value) VALUES ('schema_version', ?)",
    args: [String(SCHEMA_VERSION)],
  });

  // Store the client for future use
  client = db;
}

/**
 * Close the database connection
 */
export function closeDb(): void {
  if (client) {
    client.close();
    client = null;
  }
  migrationChecked = false;
}

/**
 * Check if the database is initialized
 */
export async function isDbInitialized(): Promise<boolean> {
  try {
    const db = await getDb();
    const result = await db.execute("SELECT value FROM metadata WHERE key = 'schema_version'");
    return result.rows.length > 0;
  } catch {
    return false;
  }
}
