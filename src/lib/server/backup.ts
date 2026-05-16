import Database from 'better-sqlite3';
import { resolve } from 'node:path';

const DB_PATH = process.env.DATABASE_URL ?? resolve(process.cwd(), 'data/codetype.db');

const TABLES = ['problems', 'attempts', 'hints_used', 'topic_mastery'] as const;
type TableName = (typeof TABLES)[number];

export type Backup = {
	version: 1;
	exportedAt: string;
	tables: Record<TableName, Record<string, unknown>[]>;
};

function openDb() {
	const sqlite = new Database(DB_PATH);
	sqlite.pragma('foreign_keys = ON');
	return sqlite;
}

export function exportBackup(): Backup {
	const sqlite = openDb();
	try {
		const tables = {} as Backup['tables'];
		for (const t of TABLES) {
			tables[t] = sqlite.prepare(`SELECT * FROM ${t}`).all() as Record<string, unknown>[];
		}
		return { version: 1, exportedAt: new Date().toISOString(), tables };
	} finally {
		sqlite.close();
	}
}

export function importBackup(backup: Backup): { counts: Record<TableName, number> } {
	if (backup?.version !== 1 || !backup.tables) {
		throw new Error('Invalid backup: missing version or tables');
	}
	for (const t of TABLES) {
		if (!Array.isArray(backup.tables[t])) {
			throw new Error(`Invalid backup: tables.${t} must be an array`);
		}
	}

	const sqlite = openDb();
	try {
		const tx = sqlite.transaction(() => {
			// Delete in reverse dependency order
			for (const t of [...TABLES].reverse()) {
				sqlite.prepare(`DELETE FROM ${t}`).run();
			}
			const counts = {} as Record<TableName, number>;
			for (const t of TABLES) {
				const rows = backup.tables[t];
				counts[t] = rows.length;
				if (rows.length === 0) continue;
				const cols = Object.keys(rows[0]);
				const placeholders = cols.map(() => '?').join(', ');
				const stmt = sqlite.prepare(
					`INSERT INTO ${t} (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`
				);
				for (const row of rows) {
					stmt.run(
						...cols.map((c) => {
							const v = row[c];
							if (v === null || v === undefined) return null;
							if (typeof v === 'object') return JSON.stringify(v);
							if (typeof v === 'boolean') return v ? 1 : 0;
							return v as string | number;
						})
					);
				}
			}
			return counts;
		});
		const counts = tx();
		return { counts };
	} finally {
		sqlite.close();
	}
}

export function backupFilename(date = new Date()): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `backup-${y}${m}${d}.json`;
}
