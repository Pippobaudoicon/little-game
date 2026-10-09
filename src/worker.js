// Leaderboard API. Static files in /public are served by Workers Assets before this runs.
// Must match `rounds` in public/game.js.
const ROUNDS = { flash: 5, classic: 10, arrows: 10, aim: 20, gonogo: 10 };

const json = (data, status = 200) => Response.json(data, { status });
const cleanName = (name) => String(name ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 16);
const isPlayer = (player) => typeof player === 'string' && /^[a-f0-9]{32}$/.test(player);
// names are unique across players, ignoring case
const taken = async (db, name, player) =>
  !!(await db.prepare('SELECT 1 FROM scores WHERE name = ? COLLATE NOCASE AND player != ? LIMIT 1').bind(name, player).first());

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/api/name' && req.method === 'POST') return rename(env.DB, (await req.json().catch(() => null)) ?? {});
    if (url.pathname !== '/api/scores') return new Response('Not found', { status: 404 });
    if (req.method === 'GET') {
      const mode = url.searchParams.get('mode');
      if (!Object.hasOwn(ROUNDS, mode)) return json({ error: 'unknown mode' }, 400);
      return json(await board(env.DB, mode, url.searchParams.get('player')));
    }
    if (req.method === 'POST') return submit(env.DB, (await req.json().catch(() => null)) ?? {});
    return new Response(null, { status: 405 });
  },
};

async function board(db, mode, player) {
  const { results } = await db
    .prepare('SELECT player, name, score, sd, best FROM scores WHERE mode = ? ORDER BY score, at LIMIT 50')
    .bind(mode).all();
  const { n: total } = await db.prepare('SELECT COUNT(*) AS n FROM scores WHERE mode = ?').bind(mode).first();
  let me = null;
  if (player) {
    const row = await db.prepare('SELECT name, score, sd, best, at FROM scores WHERE mode = ? AND player = ?').bind(mode, player).first();
    if (row) {
      const { n } = await db
        .prepare('SELECT COUNT(*) AS n FROM scores WHERE mode = ? AND (score < ? OR (score = ? AND at < ?))')
        .bind(mode, row.score, row.score, row.at).first();
      me = { name: row.name, score: row.score, sd: row.sd, best: row.best, rank: n + 1 };
    }
  }
  return {
    top: results.map((r) => ({ name: r.name, score: r.score, sd: r.sd, best: r.best, you: r.player === player })),
    total,
    me,
  };
}

// renames every board row this player holds, so a rename shows up without playing again
async function rename(db, { player, name }) {
  name = cleanName(name);
  if (!isPlayer(player)) return json({ error: 'bad player' }, 400);
  if (!name) return json({ error: 'name required' }, 400);
  if (await taken(db, name, player)) return json({ error: 'name taken' }, 409);
  await db.prepare('UPDATE scores SET name = ? WHERE player = ?').bind(name, player).run();
  return json({ name });
}

async function submit(db, { mode, player, name, times }) {
  name = cleanName(name);
  if (!Object.hasOwn(ROUNDS, mode)) return json({ error: 'unknown mode' }, 400);
  if (!isPlayer(player)) return json({ error: 'bad player' }, 400);
  if (!name) return json({ error: 'name required' }, 400);
  if (!Array.isArray(times) || times.length !== ROUNDS[mode] || !times.every((t) => Number.isFinite(t) && t >= 50 && t <= 5000)) {
    return json({ error: 'bad times' }, 400);
  }
  if (await taken(db, name, player)) return json({ error: 'name taken' }, 409);

  // Recompute everything server-side; the client's numbers are only raw round times.
  const avg = times.reduce((s, t) => s + t, 0) / times.length;
  const score = Math.round(avg);
  const sd = Math.round(Math.sqrt(times.reduce((s, t) => s + (t - avg) ** 2, 0) / times.length));
  const best = Math.round(Math.min(...times));

  await db.batch([
    db.prepare(
      `INSERT INTO scores (mode, player, name, score, sd, best, times, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (mode, player) DO UPDATE SET score = excluded.score, sd = excluded.sd, best = excluded.best,
         times = excluded.times, at = excluded.at
       WHERE excluded.score < scores.score`
    ).bind(mode, player, name, score, sd, best, JSON.stringify(times.map(Math.round)), Date.now()),
    db.prepare('UPDATE scores SET name = ? WHERE player = ?').bind(name, player),
  ]);

  const data = await board(db, mode, player);
  // where this run lands, even when it isn't the player's best
  const { n } = await db
    .prepare('SELECT COUNT(*) AS n FROM scores WHERE mode = ? AND score < ? AND player != ?')
    .bind(mode, score, player).first();
  return json({ ...data, run: { rank: n + 1, total: data.total } });
}
