# Background

My friend Colin is a major cinephile. He loves to follow the new films that are coming out, as well as showings of old films, and attends as many showings of interesting and new films as he can. Given his enthusiasm, he wants to see movies in the best format available. One new movie that especially interests him is Christopher Nolan's _The Odyssey_, for which the "best" format is IMAX 70mm. He lives in Austin Texas, where they have a 70mm IMAX at the Bob Bullock Museum downtown.

# The Problem

Unfortunately, The Bullock Museum doesn't share their ticketing information with any other aggregators, and they don't have new showtime alerts. That means the only way to find out about new movies and secure tickets early is to stalk their website, and hope you see the movie added to the "coming soon" [page](https://www.thestoryoftexas.com/imax-and-films/?_films_filter=coming-soon) before tickets sell out. Unfortunately, as you can imagine, this isn't really practical, and he misses films he would like to see because he didn't check the website at the right time.

# The Solution

To help Colin out, we're going to build the simplest program possible we can host somewhere to watch the Bullock museum's website, and notify him when new movies are added. Here's the plan:

- CloudFlare Worker running on a schedule
  - Schedule should be configuration, easily changed
- Worker starts, reads the Wordpress API for the museum and detects any new movies added
  - If new movie is added, email Colin
  - If any failure occurs, email me
  - Email should be through [resend](https://resend.com)
- Movies we've already seen should be stored in the [KV store](https://developers.cloudflare.com/kv/)

# Constraints

- New movies could be added at any time
  - Likely to be added between 7am CT and noon CT, on weekdays, so should probably run the function more often then
  - He only cares about feature films, so we should have a configurable runtime cutoff we can use to "filter out" documentaries by their runtime.
  - Doesn't have to alert as soon as the movie is posted, but we should try to catch any new posting within 2 hours if possible
- Must be the lightest weight code we can produce in Typescript
  - Must be strongly typed
- Must send new movie notifications by email to the client (configured via CLIENT_EMAIL secret)
- Must send error notifications by email to the admin (configured via ADMIN_EMAIL secret) with subject line "Colin Movie Bot Error" and body as the error itself
- Keep overall cost to under $5 a month
- All deployment should be done from my local via CLI
- All configuration should live in .env files or similar, including email addresses, runtime filter, cron expression, etc.

# Testing

Once we have this setup, we'll test emails to Colin and myself. Then, we'll want to mock the API response to add a new movie from a previous run to make sure that caching the previously seen movies works, and we get the email for the new movie as expected. Then we can set it up to monitor for real. A Michael Jackson film/documentary will be posted in a few days. If we successfully alert on that, we'll know it worked!

# Future Goals

Not worth architecting for until we have everything completely tested, but Colin would also like this bot to check the Austin Film Society [website](https://www.austinfilm.org/screenings/) and perform the same function.
