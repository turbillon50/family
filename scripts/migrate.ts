/**
 * Applies every SQL file in ./drizzle in lexical order against DATABASE_URL.
 *
 * Idempotent: every file uses IF NOT EXISTS / ON CONFLICT, so re-running is
 * a no-op. Intended to be run once on first deploy and after each new
 * migration is added.
 *
 *   npm run db:migrate
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from 'pg';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL(_UNPOOLED) not set');
  }

  const dir = join(process.cwd(), 'drizzle');
  const files = (await readdir(dir))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('No .sql files in drizzle/ — nothing to do.');
    return;
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    for (const file of files) {
      const sql = await readFile(join(dir, file), 'utf8');
      console.log(`→ applying ${file} (${sql.length} bytes)`);
      await client.query(sql);
    }
    console.log(`✓ applied ${files.length} migration file(s)`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('migrate failed:', err);
  process.exit(1);
});
