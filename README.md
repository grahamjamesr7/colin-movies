# Colin Movies

Cloudflare Worker that watches the [Bob Bullock Museum](https://www.thestoryoftexas.com/imax-and-films/?_films_filter=coming-soon) IMAX schedule and sends an email when new films are posted.

## How it works

1. Runs on a cron schedule (configurable in `wrangler.jsonc`)
2. Fetches the museum's WordPress API for current IMAX films and showtimes
3. Compares against previously seen films stored in Cloudflare KV
4. Emails the client about any new films via [Resend](https://resend.com)

## Setup

Copy the example vars file and fill in your values:

```bash
cp .dev.vars.example .dev.vars
```

Set production secrets:

```bash
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put CLIENT_EMAIL
npx wrangler secret put ADMIN_EMAIL
```

## Deploy

```bash
npm run deploy
```

## Dev

```bash
npm run dev
```

## Test

```bash
npm test
```
