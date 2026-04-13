import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../src/index';
import type { Film } from '../src/bullock';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

vi.mock('../src/bullock', () => ({
	fetchFilms: vi.fn<() => Promise<Film[]>>(),
}));

vi.mock('../src/email', () => ({
	sendEmail: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

import { fetchFilms } from '../src/bullock';
import { sendEmail } from '../src/email';

const FILMS: Film[] = [
	{ id: 1, slug: 'interstellar', title: 'Interstellar', link: 'https://example.com/interstellar', theaters: ['imax'] },
	{ id: 2, slug: 'the-dark-knight', title: 'The Dark Knight', link: 'https://example.com/the-dark-knight', theaters: ['imax'] },
	{ id: 3, slug: 'oppenheimer', title: 'Oppenheimer', link: 'https://example.com/oppenheimer', theaters: ['imax'] },
];

async function clearKV() {
	const keys = await env.SEEN_FILMS.list();
	for (const key of keys.keys) {
		await env.SEEN_FILMS.delete(key.name);
	}
}

describe('new film detection', () => {
	beforeEach(async () => {
		vi.mocked(fetchFilms).mockReset();
		vi.mocked(sendEmail).mockReset().mockResolvedValue(undefined);
		await clearKV();
	});

	it('emails about all films on first run (empty KV)', async () => {
		vi.mocked(fetchFilms).mockResolvedValue(FILMS);

		const ctx = createExecutionContext();
		const res = await worker.fetch(new IncomingRequest('http://localhost'), env, ctx);
		await waitOnExecutionContext(ctx);

		expect(res.status).toBe(200);
		const body = await res.json<{ newFilms: number }>();
		expect(body.newFilms).toBe(3);

		expect(sendEmail).toHaveBeenCalledOnce();
		const [, , subject, html] = vi.mocked(sendEmail).mock.calls[0];
		expect(subject).toContain('3 New Films');
		expect(html).toContain('Interstellar');
		expect(html).toContain('The Dark Knight');
		expect(html).toContain('Oppenheimer');
	});

	it('does not email when no new films are added', async () => {
		vi.mocked(fetchFilms).mockResolvedValue(FILMS);

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
		expect(await res.json<{ newFilms: number }>()).toEqual({ newFilms: 0 });
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it('only emails about the newly added film', async () => {
		vi.mocked(fetchFilms).mockResolvedValue(FILMS);

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
		vi.mocked(fetchFilms).mockResolvedValue([...FILMS, newFilm]);

		// second run
		const ctx2 = createExecutionContext();
		const res = await worker.fetch(new IncomingRequest('http://localhost'), env, ctx2);
		await waitOnExecutionContext(ctx2);

		expect(res.status).toBe(200);
		expect(await res.json<{ newFilms: number }>()).toEqual({ newFilms: 1 });

		expect(sendEmail).toHaveBeenCalledOnce();
		const [, , subject, html] = vi.mocked(sendEmail).mock.calls[0];
		expect(subject).toContain('1 New Film');
		expect(html).toContain('The Odyssey');
		expect(html).not.toContain('Interstellar');
	});
});
