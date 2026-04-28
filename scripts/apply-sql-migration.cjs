/* eslint-disable no-console */
const fs = require("node:fs/promises");
const path = require("node:path");
const { Client } = require("pg");

async function main() {
  const migrationPath = process.argv[2];
  if (!migrationPath) {
    throw new Error("Usage: node scripts/apply-sql-migration.cjs <path-to-sql>");
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const absolutePath = path.resolve(process.cwd(), migrationPath);
  const sql = await fs.readFile(absolutePath, "utf8");

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log(`Applied migration: ${migrationPath}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

