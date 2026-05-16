import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as schema from './schema';

const RAW_URL = process.env.DATABASE_URL ?? `file:${resolve(process.cwd(), 'data/codetype.db')}`;
const AUTH_TOKEN = process.env.DATABASE_AUTH_TOKEN;

if (RAW_URL.startsWith('file:')) {
	const localPath = RAW_URL.slice('file:'.length);
	mkdirSync(dirname(localPath), { recursive: true });
}

export const client: Client = createClient({ url: RAW_URL, authToken: AUTH_TOKEN });

export const db = drizzle(client, { schema });
export { schema };
