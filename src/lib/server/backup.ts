import { client } from './db';

const TABLES = ['problems', 'attempts', 'hints_used', 'topic_mastery'] as const;
type TableName = (typeof TABLES)[number];

// Whitelist of accepted column names per table. Anything else in an imported
// backup is rejected — column names go into SQL identifiers and cannot be
// parameterised, so the only safe option is exact-match against a fixed set.
const ALLOWED_COLUMNS: Record<TableName, ReadonlySet<string>> = {
	problems: new Set(['id', 'slug', 'title', 'difficulty', 'topics', 'url', 'description_md']),
	attempts: new Set([
		'id',
		'problem_id',
		'started_at',
		'ended_at',
		'language',
		'status',
		'code',
		'notes',
		'ai_summary'
	]),
	hints_used: new Set(['id', 'attempt_id', 'level', 'prompt', 'response', 'created_at']),
	topic_mastery: new Set([
		'topic',
		'score',
		'ease',
		'interval_days',
		'repetitions',
		'last_reviewed_at',
		'next_reviewed_at',
		'next_review_at'
	])
};

export type Backup = {
	version: 1;
	exportedAt: string;
	tables: Record<TableName, Record<string, unknown>[]>;
};

export async function exportBackup(): Promise<Backup> {
	const tables = {} as Backup['tables'];
	for (const t of TABLES) {
		const result = await client.execute(`SELECT * FROM ${t}`);
		tables[t] = result.rows.map((row) => {
			const obj: Record<string, unknown> = {};
			for (const col of result.columns) obj[col] = row[col];
			return obj;
		});
	}
	return { version: 1, exportedAt: new Date().toISOString(), tables };
}

export async function importBackup(backup: Backup): Promise<{ counts: Record<TableName, number> }> {
	if (backup?.version !== 1 || !backup.tables) {
		throw new Error('Invalid backup: missing version or tables');
	}
	for (const t of TABLES) {
		if (!Array.isArray(backup.tables[t])) {
			throw new Error(`Invalid backup: tables.${t} must be an array`);
		}
	}

	const statements: { sql: string; args: (string | number | null)[] }[] = [];
	for (const t of [...TABLES].reverse()) {
		statements.push({ sql: `DELETE FROM ${t}`, args: [] });
	}
	const counts = {} as Record<TableName, number>;
	for (const t of TABLES) {
		const rows = backup.tables[t];
		counts[t] = rows.length;
		if (rows.length === 0) continue;
		const cols = Object.keys(rows[0]);
		const allowed = ALLOWED_COLUMNS[t];
		for (const c of cols) {
			if (!allowed.has(c)) {
				throw new Error(`Invalid backup: tables.${t} has unknown column "${c}"`);
			}
		}
		const placeholders = cols.map(() => '?').join(', ');
		// cols are whitelisted above so identifier interpolation is safe.
		const sql = `INSERT INTO ${t} (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`;
		for (const row of rows) {
			const args = cols.map((c) => {
				const v = row[c];
				if (v === null || v === undefined) return null;
				if (typeof v === 'object') return JSON.stringify(v);
				if (typeof v === 'boolean') return v ? 1 : 0;
				return v as string | number;
			});
			statements.push({ sql, args });
		}
	}

	await client.batch(statements, 'write');
	return { counts };
}

export function backupFilename(date = new Date()): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `backup-${y}${m}${d}.json`;
}
