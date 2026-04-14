import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../src/index';
import type { Film, Showtime } from '../src/bullock';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

vi.mock('../src/bullock', () => ({
	fetchFilms: vi.fn<() => Promise<Film[]>>(),
	fetchShowtimes: vi.fn<() => Promise<Showtime[]>>(),
}));

vi.mock('../src/email', () => ({
	sendEmail: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

import { fetchFilms, fetchShowtimes } from '../src/bullock';
import { sendEmail } from '../src/email';

const FILMS: Film[] = [
	{ id: 1, slug: 'interstellar', title: 'Interstellar', link: 'https://example.com/interstellar', theaters: ['imax'] },
	{ id: 2, slug: 'the-dark-knight', title: 'The Dark Knight', link: 'https://example.com/the-dark-knight', theaters: ['imax'] },
	{ id: 3, slug: 'oppenheimer', title: 'Oppenheimer', link: 'https://example.com/oppenheimer', theaters: ['imax'] },
];

function showtimesFor(films: Film[]): Showtime[] {
	return films.map((f) => ({ filmSlug: f.slug, filmTitle: f.title, date: '2026-05-01' }));
}

async function clearKV() {
	const keys = await env.SEEN_FILMS.list();
	for (const key of keys.keys) {
		await env.SEEN_FILMS.delete(key.name);
	}
}

describe('new film detection', () => {
	beforeEach(async () => {
		vi.mocked(fetchFilms).mockReset();
		vi.mocked(fetchShowtimes).mockReset();
		vi.mocked(sendEmail).mockReset().mockResolvedValue(undefined);
		await clearKV();
	});

	it('emails about all films on first run (empty KV)', async () => {
		vi.mocked(fetchFilms).mockResolvedValue(FILMS);
		vi.mocked(fetchShowtimes).mockResolvedValue(showtimesFor(FILMS));

		const ctx = createExecutionContext();
		const res = await worker.fetch(new IncomingRequest('http://localhost'), env, ctx);
		await waitOnExecutionContext(ctx);

		expect(res.status).toBe(200);
		const body = await res.json<{ newFilms: Film[] }>();
		expect(body.newFilms).toHaveLength(3);

		expect(sendEmail).toHaveBeenCalledOnce();
		const [, , , subject, html] = vi.mocked(sendEmail).mock.calls[0];
		expect(subject).toContain('3 New Films');
		expect(html).toContain('Interstellar');
		expect(html).toContain('The Dark Knight');
		expect(html).toContain('Oppenheimer');
	});

	it('does not email when no new films are added', async () => {
		vi.mocked(fetchFilms).mockResolvedValue(FILMS);
		vi.mocked(fetchShowtimes).mockResolvedValue(showtimesFor(FILMS));

		// first run -- seeds KV
		const ctx1 = createExecutionContext();
		await worker.fetch(new IncomingRequest('http://localhost'), env, ctx1);
		await waitOnExecutionContext(ctx1);
		vi.mocked(sendEmail).mockClear();

		// second run -- same films
		const ctx2 = createExecutionContext();
		const res = await worker.fetch(new IncomingRequest('http://localhost'), env, ctx2);
		await waitOnExecutionContext(ctx2);

		expect(res.status).toBe(200);
		expect((await res.json<{ newFilms: Film[] }>()).newFilms).toHaveLength(0);
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it('only emails about the newly added film', async () => {
		vi.mocked(fetchFilms).mockResolvedValue(FILMS);
		vi.mocked(fetchShowtimes).mockResolvedValue(showtimesFor(FILMS));

		// first run -- seeds KV with the initial 3
		const ctx1 = createExecutionContext();
		await worker.fetch(new IncomingRequest('http://localhost'), env, ctx1);
		await waitOnExecutionContext(ctx1);
		vi.mocked(sendEmail).mockClear();

		// a new film appears
		const newFilm: Film = {
			id: 4,
			slug: 'the-odyssey',
			title: 'The Odyssey',
			link: 'https://example.com/the-odyssey',
			theaters: ['imax'],
		};
		const allFilms = [...FILMS, newFilm];
		vi.mocked(fetchFilms).mockResolvedValue(allFilms);
		vi.mocked(fetchShowtimes).mockResolvedValue(showtimesFor(allFilms));

		// second run
		const ctx2 = createExecutionContext();
		const res = await worker.fetch(new IncomingRequest('http://localhost'), env, ctx2);
		await waitOnExecutionContext(ctx2);

		expect(res.status).toBe(200);
		expect((await res.json<{ newFilms: Film[] }>()).newFilms).toHaveLength(1);

		expect(sendEmail).toHaveBeenCalledOnce();
		const [, , , subject, html] = vi.mocked(sendEmail).mock.calls[0];
		expect(subject).toContain('1 New Film');
		expect(html).toContain('The Odyssey');
		expect(html).not.toContain('Interstellar');
	});

	it('logs new showtimes on seen films without emailing', async () => {
		vi.mocked(fetchFilms).mockResolvedValue([FILMS[0]]);
		vi.mocked(fetchShowtimes).mockResolvedValue([{ filmSlug: 'interstellar', filmTitle: 'Interstellar', date: '2026-05-01' }]);

		// first run -- seeds KV
		const ctx1 = createExecutionContext();
		await worker.fetch(new IncomingRequest('http://localhost'), env, ctx1);
		await waitOnExecutionContext(ctx1);
		vi.mocked(sendEmail).mockClear();

		// second run -- a new showtime appears for the same film
		vi.mocked(fetchShowtimes).mockResolvedValue([
			{ filmSlug: 'interstellar', filmTitle: 'Interstellar', date: '2026-05-01' },
			{ filmSlug: 'interstellar', filmTitle: 'Interstellar', date: '2026-06-15' },
		]);

		const logged: string[] = [];
		const origLog = console.log;
		console.log = (...args: unknown[]) => {
			logged.push(args.map(String).join(' '));
		};
		const ctx2 = createExecutionContext();
		const res = await worker.fetch(new IncomingRequest('http://localhost'), env, ctx2);
		await waitOnExecutionContext(ctx2);
		console.log = origLog;

		expect(res.status).toBe(200);
		expect((await res.json<{ newFilms: Film[] }>()).newFilms).toHaveLength(0);
		expect(sendEmail).not.toHaveBeenCalled();

		const joined = logged.join('\n');
		expect(joined).toMatch(/New showtimes for existing film "Interstellar".*2026-06-15/);

		// third run -- no changes, the new showtime should not be logged again
		const logged2: string[] = [];
		console.log = (...args: unknown[]) => {
			logged2.push(args.map(String).join(' '));
		};
		const ctx3 = createExecutionContext();
		await worker.fetch(new IncomingRequest('http://localhost'), env, ctx3);
		await waitOnExecutionContext(ctx3);
		console.log = origLog;
		expect(logged2.join('\n')).not.toContain('New showtimes for existing film');
	});

	it('sends admin copy when COPY_ADMIN is true and TEST is false', async () => {
		vi.mocked(fetchFilms).mockResolvedValue(FILMS);
		vi.mocked(fetchShowtimes).mockResolvedValue(showtimesFor(FILMS));

		const prodEnv = { ...env, TEST: 'false', COPY_ADMIN: 'true' } as typeof env;
		const ctx = createExecutionContext();
		await worker.fetch(new IncomingRequest('http://localhost'), prodEnv, ctx);
		await waitOnExecutionContext(ctx);

		expect(sendEmail).toHaveBeenCalledTimes(2);
		const [, , colinTo] = vi.mocked(sendEmail).mock.calls[0];
		const [, , adminTo] = vi.mocked(sendEmail).mock.calls[1];
		expect(colinTo).toBe(env.CLIENT_EMAIL);
		expect(adminTo).toBe(env.ADMIN_EMAIL);
	});

	it('ignores showtimes for non-IMAX films', async () => {
		vi.mocked(fetchFilms).mockResolvedValue(FILMS);
		// showtimes include an entry for a film not in the IMAX list
		vi.mocked(fetchShowtimes).mockResolvedValue([
			...showtimesFor([FILMS[0]]),
			{ filmSlug: 'shipwrecked', filmTitle: 'Shipwrecked', date: '2026-09-30' },
		]);

		const ctx = createExecutionContext();
		const res = await worker.fetch(new IncomingRequest('http://localhost'), env, ctx);
		await waitOnExecutionContext(ctx);

		expect(res.status).toBe(200);
		const body = await res.json<{ newFilms: Film[] }>();
		// only Interstellar is active -- the non-IMAX showtime doesn't make any extra film active
		expect(body.newFilms).toHaveLength(1);
		expect(body.newFilms[0].slug).toBe('interstellar');
	});

	it('skips films with no upcoming showtimes', async () => {
		vi.mocked(fetchFilms).mockResolvedValue(FILMS);
		// only Interstellar has showtimes
		vi.mocked(fetchShowtimes).mockResolvedValue(showtimesFor([FILMS[0]]));

		const ctx = createExecutionContext();
		const res = await worker.fetch(new IncomingRequest('http://localhost'), env, ctx);
		await waitOnExecutionContext(ctx);

		expect(res.status).toBe(200);
		const body = await res.json<{ newFilms: Film[] }>();
		expect(body.newFilms).toHaveLength(1);

		expect(sendEmail).toHaveBeenCalledOnce();
		const [, , , , html] = vi.mocked(sendEmail).mock.calls[0];
		expect(html).toContain('Interstellar');
		expect(html).not.toContain('The Dark Knight');
		expect(html).not.toContain('Oppenheimer');
	});
});
