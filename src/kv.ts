import type { Film, Showtime } from './bullock.ts';

// stored value per film
interface SeenFilm {
	title: string;
	firstSeenAt: string;
	showtimeDates: string[];
}

export interface FilmChange {
	film: Film;
	isNew: boolean;
	addedDates: string[];
	currentDates: string[];
	firstSeenAt: string;
}

function groupDatesBySlug(showtimes: Showtime[]): Map<string, string[]> {
	const out = new Map<string, string[]>();
	for (const s of showtimes) {
		const arr = out.get(s.filmSlug) ?? [];
		arr.push(s.date);
		out.set(s.filmSlug, arr);
	}
	return out;
}

export async function detectChanges(kv: KVNamespace, films: Film[], showtimes: Showtime[]): Promise<FilmChange[]> {
	const byFilm = groupDatesBySlug(showtimes);
	const stored = await Promise.all(films.map((f) => kv.get(f.slug)));

	const changes: FilmChange[] = [];
	for (let i = 0; i < films.length; i++) {
		const film = films[i];
		const currentDates = (byFilm.get(film.slug) ?? []).slice().sort();
		const raw = stored[i];
		if (raw === null) {
			changes.push({
				film,
				isNew: true,
				addedDates: currentDates,
				currentDates,
				firstSeenAt: new Date().toISOString(),
			});
			continue;
		}
		const prev = JSON.parse(raw) as SeenFilm;
		const prevSet = new Set(prev.showtimeDates ?? []);
		const addedDates = currentDates.filter((d) => !prevSet.has(d));
		changes.push({
			film,
			isNew: false,
			addedDates,
			currentDates,
			firstSeenAt: prev.firstSeenAt,
		});
	}
	return changes;
}

export async function persistChanges(kv: KVNamespace, changes: FilmChange[]): Promise<void> {
	// only write films that are new or have added showtimes
	const toWrite = changes.filter((c) => c.isNew || c.addedDates.length > 0);
	await Promise.all(
		toWrite.map((c) => {
			const value: SeenFilm = {
				title: c.film.title,
				firstSeenAt: c.firstSeenAt,
				showtimeDates: c.currentDates,
			};
			return kv.put(c.film.slug, JSON.stringify(value));
		}),
	);
}
