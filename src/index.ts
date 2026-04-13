import { fetchFilms } from './bullock.ts';
import { sendEmail } from './email.ts';
import { getNewFilms, markSeen } from './kv.ts';

export default {
	async fetch(_request: Request, env: Env): Promise<Response> {
		console.log('Manual fetch triggered.');
		try {
			const newFilms = await checkForNewFilms(env);
			return new Response(JSON.stringify({ newFilms: newFilms.length }), {
				headers: { 'content-type': 'application/json' },
			});
		} catch (error) {
			console.error('Error during fetch handler:', error);
			await sendEmail(env.RESEND_API_KEY, env.ADMIN_EMAIL, 'Colin Movie Bot Error', String(error));
			return new Response('error', { status: 500 });
		}
	},

	async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
		console.log('Scheduled run triggered.');
		ctx.waitUntil(
			checkForNewFilms(env).catch(async (error) => {
				console.error('Error during scheduled run:', error);
				await sendEmail(env.RESEND_API_KEY, env.ADMIN_EMAIL, 'Colin Movie Bot Error', String(error));
			}),
		);
	},
} satisfies ExportedHandler<Env>;

async function checkForNewFilms(env: Env) {
	const allFilms = await fetchFilms('imax');
	console.log(`Fetched ${allFilms.length} total IMAX films.`);
	const newFilms = await getNewFilms(env.SEEN_FILMS, allFilms);

	if (newFilms.length === 0) {
		console.log('No new films detected.');
		return newFilms;
	}

	console.log(`Detected ${newFilms.length} new film(s): ${newFilms.map((f) => f.title).join(', ')}`);
	const filmList = newFilms.map((f) => `<li><a href="${f.link}">${f.title}</a></li>`).join('');
	await sendEmail(
		env.RESEND_API_KEY,
		env.TEST ? env.ADMIN_EMAIL : env.CLIENT_EMAIL,
		`[Movie Bot] ${newFilms.length} New Film${newFilms.length > 1 ? 's' : ''} at the Bullock!`,
		`<p>New IMAX films just posted:</p><ul>${filmList}</ul>`,
	);
	await markSeen(env.SEEN_FILMS, newFilms);

	return newFilms;
}
