import type { Film } from './bullock.ts';

// stored value per film
interface SeenFilm {
	title: string;
	firstSeenAt: string;
}

export async function getNewFilms(kv: KVNamespace, films: Film[]): Promise<Film[]> {
	const results = await Promise.all(films.map((f) => kv.get(f.slug)));
	console.debug(
		'KV lookup results:',
		films.map((f, i) => ({ slug: f.slug, seen: results[i] !== null, value: results[i] })),
	);
	const newFilms = films.filter((_, i) => results[i] === null);
	console.log(`Found ${newFilms.length} new films.`);
	return newFilms;
}

export async function markSeen(kv: KVNamespace, films: Film[]): Promise<void> {
	await Promise.all(
		films.map((f) => {
			const value: SeenFilm = { title: f.title, firstSeenAt: new Date().toISOString() };
			return kv.put(f.slug, JSON.stringify(value));
		}),
	);
}
