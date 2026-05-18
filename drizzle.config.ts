import { defineConfig } from 'drizzle-kit';

const url = process.env.DATABASE_URL ?? 'file:./data/codetype.db';
const isRemote = !url.startsWith('file:');

if (isRemote && !process.env.DATABASE_AUTH_TOKEN) {
	throw new Error('DATABASE_AUTH_TOKEN is required for non-file DATABASE_URL');
}

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dialect: isRemote ? 'turso' : 'sqlite',
	dbCredentials: isRemote
		? { url, authToken: process.env.DATABASE_AUTH_TOKEN! }
		: { url: url.slice('file:'.length) },
	strict: true,
	verbose: true
});
