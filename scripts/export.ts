import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { exportBackup, backupFilename } from '../src/lib/server/backup.ts';

async function main() {
	const arg = process.argv[2];
	const filename = arg ?? backupFilename();
	const outPath = resolve(process.cwd(), filename);
	const backup = await exportBackup();
	writeFileSync(outPath, JSON.stringify(backup, null, 2), 'utf8');
	const counts = Object.fromEntries(Object.entries(backup.tables).map(([k, v]) => [k, v.length]));
	console.log(`Wrote ${outPath}`);
	console.log('Row counts:', counts);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
