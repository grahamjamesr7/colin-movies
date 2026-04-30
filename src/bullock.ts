// types

export type Theater = 'imax' | 'spirit';

export interface Film {
	id: number;
	slug: string;
	title: string;
	link: string;
	theaters: Theater[];
}

export interface Showtime {
	filmSlug: string;
	filmTitle: string;
	date: string;
}

// constants

const BASE = 'https://www.thestoryoftexas.com/wp-json/wp/v2';

const THEATER_TERMS: Record<Theater, number> = {
	imax: 283,
	spirit: 281,
};

const TERM_TO_THEATER: Record<number, Theater> = Object.fromEntries(Object.entries(THEATER_TERMS).map(([k, v]) => [v, k as Theater]));

// prefixes that appear on showtime titles but not on the corresponding film title
const KNOWN_SHOWTIME_PREFIXES = ['IMAX DOC | ', 'IMAX \u2013 '];

// upstream shapes

interface WPFilm {
	id: number;
	slug: string;
	link: string;
	title: { rendered: string };
	theater: number[];
}

interface WPShowtime {
	slug: string;
	title: { rendered: string };
}

// helpers

const ENTITY_MAP: Record<string, string> = {
	'&amp;': '&',
	'&#8217;': '\u2019',
	'&#8211;': '\u2013',
	'&quot;': '"',
};

function decodeEntities(s: string): string {
	const decoded = s.replace(/&[^;]+;/g, (m) => {
		const v = ENTITY_MAP[m];
		if (v === undefined) {
			throw new Error(`Unknown HTML entity ${m} in ${JSON.stringify(s)}`);
		}
		return v;
	});
	return decoded;
}

async function getJSON<T>(url: string): Promise<{ body: T; res: Response }> {
	const res = await fetch(url, { cf: { cacheTtl: 0 } });
	if (!res.ok) {
		throw new Error(`GET ${url} -> ${res.status}`);
	}
	const body = (await res.json()) as T;
	return { body, res };
}

// client

export async function fetchFilms(theater?: Theater): Promise<Film[]> {
	console.debug('Fetching films from the Bullock museum...');
	const params = new URLSearchParams({ per_page: '100' });
	if (theater) params.set('theater', String(THEATER_TERMS[theater]));
	const { body } = await getJSON<WPFilm[]>(`${BASE}/film?${params}`);

	console.debug('Fetched films successfully.');
	return body.map((f) => ({
		id: f.id,
		slug: f.slug,
		title: decodeEntities(f.title.rendered),
		link: f.link,
		theaters: f.theater.map((termId) => {
			const t = TERM_TO_THEATER[termId];
			if (!t) {
				throw new Error(`Unknown theater term id ${termId} on film ${f.slug}`);
			}
			return t;
		}),
	}));
}

function resolveFilmName(parsed: string, byName: Map<string, Film>): Film | undefined {
	const direct = byName.get(parsed);
	if (direct) return direct;
	for (const prefix of KNOWN_SHOWTIME_PREFIXES) {
		if (parsed.startsWith(prefix)) {
			const hit = byName.get(parsed.slice(prefix.length));
			if (hit) return hit;
		}
	}
	return undefined;
}

function parseShowtimeDate(raw: string, slug: string): { name: string; date: string } {
	const titleRe = /^(.+?)\s+[\u2013-]\s+(\d{4}-\d{2}-\d{2})$/;
	const m = titleRe.exec(raw);
	if (m) return { name: m[1], date: m[2] };
	const slugRe = /-(\d{4}-\d{2}-\d{2})$/;
	const sm = slugRe.exec(slug);
	if (sm) return { name: raw, date: sm[1] };
	throw new Error(`Unparseable showtime: title=${JSON.stringify(raw)} slug=${slug}`);
}

export async function fetchShowtimes(films: Film[]): Promise<Showtime[]> {
	console.debug(`Fetching showtimes for ${films.length} films from the Bullock Museum...`);
	const byName = new Map<string, Film>();
	for (const f of films) byName.set(f.title, f);

	const today = new Date().toISOString().slice(0, 10);

	const parsePage = (page: WPShowtime[]): Showtime[] => {
		const out: Showtime[] = [];
		for (const s of page) {
			const raw = decodeEntities(s.title.rendered);
			const { name, date } = parseShowtimeDate(raw, s.slug);
			if (date < today) continue;
			const film = resolveFilmName(name, byName);
			if (!film) {
				// showtimes don't carry a theater taxonomy, so non-IMAX
				// showtimes (e.g. Spirit Theater) won't match -- skip them
				console.debug(`Skipping unmatched showtime: ${JSON.stringify(raw)}`);
				continue;
			}
			out.push({ filmSlug: film.slug, filmTitle: film.title, date });
		}
		return out;
	};

	const firstUrl = `${BASE}/showtime?per_page=100&page=1`;
	const first = await getJSON<WPShowtime[]>(firstUrl);
	const totalPages = Number(first.res.headers.get('x-wp-totalpages') ?? '1');
	if (!Number.isFinite(totalPages) || totalPages < 1) {
		throw new Error(`Bad X-WP-TotalPages on ${firstUrl}`);
	}

	const out: Showtime[] = parsePage(first.body);
	for (let page = 2; page <= totalPages; page++) {
		const { body } = await getJSON<WPShowtime[]>(`${BASE}/showtime?per_page=100&page=${page}`);
		out.push(...parsePage(body));
	}
	console.debug(`Done, found ${totalPages} pages of showtimes. (${out.length} showtimes)`);
	return out;
}
