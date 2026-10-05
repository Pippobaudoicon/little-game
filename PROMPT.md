# Test Your Reaction — Remastered

The original prompt, expanded into the brief this version was built from.

> **Original:** "Make a much better version of my 2021 reaction game, with leaderboards,
> multiple reaction modes for mouse or keyboard, and beautiful UI, visual graphics and UX."

## The brief

Rebuild *Test Your Reaction!* (2021: one random-coloured square or circle, click it, see
your time) as a polished browser game that honours the original instead of replacing it.

### 1. Five modes, every input

| # | Mode | Tests | Input | Rounds | Score |
|---|------|-------|-------|--------|-------|
| 1 | **Flash** | Simple reaction: screen turns from red to green after a random 1.5–5 s | click, any key, tap | 5 | avg ms |
| 2 | **Classic '21** | The 2021 original: a random-colour square or circle at a random spot | click, tap | 10 | avg ms |
| 3 | **Arrows** | Choice reaction: press the arrow shown (wrong key +200 ms) | arrows / WASD, on-screen pad on touch | 10 | avg ms |
| 4 | **Aim** | 20 targets back to back, no breaks | click, tap | 20 | avg ms per target |
| 5 | **Go / No-Go** | Inhibition: green circle = hit, red square = hold (+300 ms if you don't) | click, any key, tap | 10 go trials | avg ms |

Rules shared by all modes:
- Pressing before the signal is a **false start**: the round restarts.
- Responses under **100 ms** count as guesses, not reactions, and are treated as false starts.
- Lower is better. Every mode scores in milliseconds, so one leaderboard shape fits all.

### 2. Measure honestly
- Listen on `pointerdown` and `keydown`, not `click`. A click fires on release, which adds about 80 ms.
- Start the clock from the `requestAnimationFrame` timestamp of the frame that draws the stimulus.
- Stop it with the event's own `timeStamp`, not with the time the handler happened to run.
- No transitions on the stimulus itself. It appears instantly.
- State the remaining hardware latency in the UI rather than hiding it.

### 3. Global leaderboard
- One board per mode, showing each player's best average.
- Rows show a bar for the average with **± standard-deviation whiskers**, so consistency is visible
  (21st.dev "Leaderboard Table" by eugeneshilow, rebuilt in vanilla JS).
- Rows slide to their new rank when you switch modes.
- Your row is highlighted. If you're outside the top 50, it's pinned at the bottom with your rank.
- The server recomputes the score from the raw round times and rejects impossible runs.
- Players are an anonymous random ID kept in the browser plus a display name. No accounts.
- If the API is unreachable the game still works and keeps personal bests locally.

### 4. Results that feel earned
- A personal result card (21st.dev "First Place Leaderboard" card, rebuilt). It shows the avatar ring
  with your global rank badge, your name, a score pill, and a "faster than X% of players" bar.
- Tier from S to D (Lightning, Cheetah, Fox, Human, Sloth), with thresholds per mode.
- A per-round bar chart with an average line, plus best, worst, consistency, false starts, misses and errors.
- A fanfare and confetti on a new personal best. One key copies a shareable result.

### 5. Look and feel
- Concept: **stadium timing board at night**. Near-black with an LED dot grid and film grain.
  Dot-matrix numerals (*Doto*) for every time, tall condensed *Big Shoulders Display* for headlines,
  and *Martian Mono* for labels.
- Signal colours: red means wait, lime means go, amber means you. Each mode has its own accent.
- The hero reads **TEST YOUR REACTION!** like the 2021 `<h1>`. The two O's are the original square
  and circle, changing to random colours as the original did.
- Hits burst into small squares and circles. Hit sounds are synthesised, and their pitch rises
  as your reaction gets faster. No audio files.
- Respect `prefers-reduced-motion`. Works from 360 px phones to wide desktops.

### 6. Keyboard-first UX
`1–5` start a mode · `Space`/click begins · `Esc` quits · `R` retries · `L` opens the leaderboard ·
`C` copies the result · `N` renames you · `M` mutes.

### 7. Respect the original
The untouched 2021 file ships at `/classic/original-2021.html`, linked from the footer.

### 8. Stack
- Plain HTML, CSS and JS with no framework and no build step.
- One Cloudflare Worker serves the static files and `/api/scores`, backed by a single D1 (SQLite) table.
- The only dependency is `wrangler`, the deploy tool.
