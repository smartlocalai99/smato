#!/usr/bin/env node
// Runs a .sql file straight against the Supabase Postgres database, using
// DATABASE_URL from .env.local. Defaults to setup.sql, which is written to
// be safe to re-run (create table if not exists / add column if not exists),
// so this doubles as "apply whatever's changed" with no separate migration
// history to track for a project this size.
//
// Usage:
//   node scripts/migrate.js              # runs setup.sql
//   node scripts/migrate.js path/to.sql  # runs a specific file

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2];
  }
}

async function main() {
  loadEnvLocal();
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set in .env.local");
    process.exit(1);
  }

  const target = process.argv[2] || path.join(__dirname, "..", "setup.sql");
  const sql = fs.readFileSync(target, "utf8");

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    console.log(`Running ${path.relative(process.cwd(), target)}...`);
    const result = await client.query(sql);
    const withRows = Array.isArray(result) ? result.find((r) => r.rows?.length) : result;
    if (withRows?.rows?.length) console.table(withRows.rows);
    console.log("Done.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
