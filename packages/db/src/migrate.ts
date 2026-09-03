import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { Pool } from "pg";

const migrationUrl = new URL(
  "../migrations/0001_catalogue.sql",
  import.meta.url,
);

export const migrateCatalogue = async (pool: Pool): Promise<void> => {
  const migration = await readFile(fileURLToPath(migrationUrl), "utf8");
  await pool.query(migration);
};

const isDirectExecution =
  process.argv[1] !== undefined &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isDirectExecution) {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined) {
    throw new Error("DATABASE_URL is required");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await migrateCatalogue(pool);
  } finally {
    await pool.end();
  }
}
