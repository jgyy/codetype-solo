import { exportBackup, backupFilename } from '$lib/server/backup';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const backup = await exportBackup();
	const body = JSON.stringify(backup, null, 2);
	return new Response(body, {
		headers: {
			'content-type': 'application/json',
			'content-disposition': `attachment; filename="${backupFilename()}"`
		}
	});
};
