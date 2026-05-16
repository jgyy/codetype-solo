import { defineConfig } from 'drizzle-kit';

const url = process.env.DATABASE_URL ?? 'file:./data/codetype.db';
const isRemote = !url.startsWith('file:');

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dialect: isRemote ? 'turso' : 'sqlite',
	dbCredentials: isRemote
		? { url, authToken: process.env.DATABASE_AUTH_TOKEN }
		: { url: url.slice('file:'.length) },
	strict: true,
	verbose: true
});
