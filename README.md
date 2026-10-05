# Test Your Reaction!

A reaction game I made in 2021, rebuilt with five modes (mouse, keyboard and touch), a global
leaderboard and a much better look. The brief it was built from is in [PROMPT.md](PROMPT.md).
The original is still playable at [`/classic/original-2021.html`](public/classic/original-2021.html).

- `public/`: the game (plain HTML/CSS/JS, no build step)
- `src/worker.js`: the `/api/scores` leaderboard API (Cloudflare Worker)
- `schema.sql`: the single D1 table

## Run locally

```bash
npm install
npm run db:local   # create the local leaderboard table (once)
npm run dev        # http://localhost:8787
```

## Deploy to Cloudflare

```bash
npx wrangler login
npx wrangler d1 create reaction   # paste the printed database_id into wrangler.jsonc
npm run db:remote
npm run deploy
```
