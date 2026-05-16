import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { importBackup, type Backup } from '../src/lib/server/backup.ts';

async function main() {
	const arg = process.argv[2];
	if (!arg) {
		console.error('Usage: tsx scripts/import.ts <backup.json>');
		process.exit(1);
	}
	const inPath = resolve(process.cwd(), arg);
	const raw = readFileSync(inPath, 'utf8');
	const backup = JSON.parse(raw) as Backup;
	const { counts } = await importBackup(backup);
	console.log(`Imported (destructive) from ${inPath}`);
	console.log('Row counts:', counts);
}

main();
