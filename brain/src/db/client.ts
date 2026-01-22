import { type Client, createClient } from "@libsql/client";
import { getDbPath } from "../config/index.ts";
import { CREATE_SCHEMA, CREATE_VECTOR_INDEX, SCHEMA_VERSION } from "./schema.ts";

let client: Client | null = null;

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
