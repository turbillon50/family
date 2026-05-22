import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

neonConfig.fetchConnectionCache = true;

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Family cannot reach Neon. ' +
        'See .env.example.',
    );
  }
  return url;
}

const sqlClient = neon(requireDatabaseUrl());

export const db = drizzle(sqlClient, { schema });
export { schema };
export type Db = typeof db;
