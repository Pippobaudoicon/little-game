// Test Your Reaction — remastered. Plain JS, no build step.
'use strict';

const $ = (s) => document.querySelector(s);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const stdev = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };

// Rounds must match ROUNDS in src/worker.js. Tiers are S/A/B/C cut-offs in ms; slower is D.
const MODES = {
  flash:   { key: '1', name: 'Flash',       rounds: 5,  color: '#c8ff2e', tiers: [200, 240, 290, 350], inputs: 'Mouse · Key · Touch',
             tag: 'Pure reaction. Wait for green, then hit anything.',
             intro: 'The screen turns <b>green</b> after a random wait. Click, tap or press any key as soon as it does.<br><em>Jump early and the round restarts.</em>' },
  classic: { key: '2', name: "Classic '21", rounds: 10, color: '#ff4fd8', tiers: [330, 400, 480, 580], inputs: 'Mouse · Touch',
             tag: 'The 2021 original. Random shapes, random colours, random places.',
             intro: 'A <b>square or a circle</b> appears somewhere, in a random colour, just like 2021. Click it as fast as you can.' },
  arrows:  { key: '3', name: 'Arrows',      rounds: 10, color: '#ffb21e', tiers: [360, 430, 510, 620], inputs: 'Keyboard · Pad',
             tag: 'Choice reaction. Press the arrow you see.',
             intro: 'An arrow appears. Press the <b>matching arrow key</b> (or WASD).<br><em>Wrong key: +200 ms. Pressing early restarts the round.</em>' },
  aim:     { key: '4', name: 'Aim',         rounds: 20, color: '#4de3ff', tiers: [420, 520, 620, 760], inputs: 'Mouse · Touch',
             tag: 'Twenty targets back to back. Speed and precision.',
             intro: '<b>Twenty targets</b>, one after another, no breaks. Each one is timed from the moment it appears.' },
  gonogo:  { key: '5', name: 'Go / No-Go',  rounds: 10, color: '#ff3d2e', tiers: [300, 350, 420, 500], inputs: 'Mouse · Key · Touch',
             tag: 'Green circle: hit it. Red square: freeze.',
             intro: '<b style="color:#c8ff2e">Green circle</b>: click or press any key. <b style="color:#ff3d2e">Red square</b>: do nothing.<br><em>Hitting red adds +300 ms to your next go. Missing green counts as 1000 ms.</em>' },
};
const TIERS = [['S', 'Lightning'], ['A', 'Cheetah'], ['B', 'Fox'], ['C', 'Human'], ['D', 'Sloth']];
const TIER_COLORS = ['#c8ff2e', '#7dffb0', '#ffd25e', '#ff9a3d', '#ff3d2e'];
const tierOf = (mode, ms) => { const i = MODES[mode].tiers.findIndex((t) => ms < t); return i < 0 ? 4 : i; };

// ───────── storage (can throw in private modes) ─────────
const store = {
  get(k, d) { try { const v = localStorage.getItem('rx.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('rx.' + k, JSON.stringify(v)); } catch {} },
};
let player = store.get('player');
if (!player) {
  player = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  store.set('player', player);
}
// everyone is on the board from their first run; the results card nudges anons to pick a real name
const anonName = 'anon-' + player.slice(0, 4);
let playerName = store.get('name', '') || anonName;
const pbs = store.get('pb', {});
let soundOn = store.get('sound', true);

// name → stable colour + shape, a nod to the 2021 squares and circles
function look(name) {
  let h = 2166136261;
  for (const ch of name.toLowerCase()) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h >>>= 0;
  return { color: `hsl(${h % 360} 90% 62%)`, circle: (h >> 9) % 2 === 0 };
}
function avatar(el, name) {
  const { color, circle } = look(name);
  el.style.setProperty('--av', color);
  el.classList.toggle('circle', circle);
}

// ───────── sound: tiny synth, no files ─────────
let ac;
function tone(freq, dur = 0.07, type = 'triangle', gain = 0.06, at = 0) {
  if (!soundOn) return;
  ac ??= new AudioContext();
  const t = ac.currentTime + at, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination);
  o.start(t); o.stop(t + dur);
}
const sfx = {
  hit: (ms) => tone(Math.max(260, 1500 - (ms - 150) * 2.2), 0.08, 'triangle', 0.07),
  bad: () => { tone(110, 0.22, 'sawtooth', 0.05); tone(82, 0.22, 'sawtooth', 0.04); },
  soft: () => tone(520, 0.05, 'sine', 0.04),
  fanfare: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'square', 0.035, i * 0.09)),
};

// ───────── particles ─────────
const fx = $('#fx'), ctx = fx.getContext('2d');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let parts = [], fxRunning = false;
function sizeFx() {
  const d = devicePixelRatio || 1;
  fx.width = innerWidth * d; fx.height = innerHeight * d;
  ctx.setTransform(d, 0, 0, d, 0, 0);
}
addEventListener('resize', sizeFx); sizeFx();

function burst(x, y, color, n = 18, power = 1) {
  if (reduced.matches) return;
  parts.push({ ring: 1, x, y, r: 8, life: 1, color });
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = (2 + Math.random() * 6) * power;
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, s: 3 + Math.random() * 6, life: 1, color, sq: Math.random() < 0.5, rot: Math.random() * 6 });
  }
  if (!fxRunning) { fxRunning = true; requestAnimationFrame(stepFx); }
}
function stepFx() {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  parts = parts.filter((p) => (p.life -= p.ring ? 0.045 : 0.018) > 0);
  for (const p of parts) {
    ctx.globalAlpha = p.life;
    if (p.ring) {
      p.r += 6;
      ctx.strokeStyle = p.color; ctx.lineWidth = 3 * p.life;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.stroke();
      continue;
    }
    p.x += p.vx; p.y += p.vy; p.vy += 0.22; p.vx *= 0.98; p.rot += 0.12;
    ctx.fillStyle = p.color;
    if (p.sq) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s); ctx.restore(); }
    else { ctx.beginPath(); ctx.arc(p.x, p.y, p.s / 2, 0, 7); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
  if (parts.length) requestAnimationFrame(stepFx); else fxRunning = false;
}
function confetti() {
  for (let i = 0; i < 5; i++) setTimeout(() => burst(rand(0.15, 0.85) * innerWidth, rand(0.1, 0.45) * innerHeight, pick(TIER_COLORS), 26, 1.3), i * 140);
}

// ───────── screens ─────────
let screen = 'menu', backTo = 'menu';
function show(s) {
  if (s === 'board' && screen !== 'board') backTo = screen === 'play' ? 'menu' : screen;
  screen = s;
  document.body.dataset.screen = s;
  scrollTo(0, 0);
}
let toastTimer;
function toast(text) {
  const t = $('#toast');
  t.textContent = text; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

// ───────── menu ─────────
function renderMenu() {
  $('#modes').replaceChildren(...Object.entries(MODES).map(([id, M], i) => {
    const b = document.createElement('button');
    b.className = 'mode'; b.dataset.mode = id;
    b.style.setProperty('--c', M.color); b.style.setProperty('--i', i);
    b.innerHTML = `<kbd class="mode-key">${M.key}</kbd><span class="art art-${id}"><i></i><i></i></span>
      <span class="mode-name"></span><span class="mode-tag"></span>
      <span class="mode-meta"><span>${M.inputs}</span><span>${pbs[id] ? `PB <b>${pbs[id]}</b> ms` : 'No runs yet'}</span></span>`;
    b.querySelector('.mode-name').textContent = M.name;
    b.querySelector('.mode-tag').textContent = M.tag;
    b.addEventListener('click', () => startRun(id));
    return b;
  }));
}
function renderName() {
  $('#name-chip').textContent = playerName;
  $('#rc-claim').hidden = playerName !== anonName;
}
function renderSound() {
  $('#sound-btn').setAttribute('aria-pressed', soundOn);
}
// the 2021 hero shapes keep changing colour, like the original randColor()
setInterval(() => {
  if (screen !== 'menu' || reduced.matches) return;
  for (const o of document.querySelectorAll('.hero .o')) o.style.background = `hsl(${Math.random() * 360} 90% 60%)`;
}, 1400);

// ───────── the run ─────────
const play = $('#play'), stage = $('#stage');
let run = null;

function startRun(mode) {
  if (run) clearTimeout(run.timer);
  const M = MODES[mode];
  run = { mode, M, times: [], falseStarts: 0, misses: 0, clicks: 0, errors: 0, penalty: 0, phase: 'intro', shownAt: 0, timer: 0, stim: null };
  play.dataset.mode = mode;
  play.style.setProperty('--c', M.color);
  $('#hud-mode').textContent = M.name;
  stage.replaceChildren();
  $('#readout').replaceChildren();
  renderPips();
  setPhase('intro');
  message(M.name, `${M.intro}<br><br><kbd>Space</kbd> or tap to start`);
  show('play');
}
function setPhase(p) { run.phase = p; play.dataset.phase = p; }
function message(title, sub = '') { $('#msg-title').textContent = title; $('#msg-sub').innerHTML = sub; }
function after(ms, fn) { clearTimeout(run.timer); run.timer = setTimeout(fn, ms); }
// clock starts at the frame that paints the stimulus (now() only until that frame arrives)
function stamp() { run.shownAt = performance.now(); requestAnimationFrame((t) => { run.shownAt = t; }); }

function renderPips() {
  const ol = $('#pips');
  ol.replaceChildren(...Array.from({ length: run.M.rounds }, (_, i) => {
    const li = document.createElement('li');
    const t = run.times[i];
    if (t != null) { li.className = 'done'; li.style.setProperty('--t', TIER_COLORS[tierOf(run.mode, t)]); }
    else if (i === run.times.length) li.className = 'now';
    return li;
  }));
}

function readout(ms) {
  const r = $('#readout'), tier = tierOf(run.mode, ms);
  r.style.setProperty('--t', TIER_COLORS[tier]);
  r.innerHTML = `${ms}<small>ms</small><span class="tier">${TIERS[tier][0]} · ${TIERS[tier][1]}</span>`;
  r.classList.remove('pop'); void r.offsetWidth; r.classList.add('pop');
}

// Push a round time (plus any pending penalty) and give feedback.
function record(raw) {
  const ms = Math.round(raw + run.penalty);
  run.penalty = 0;
  run.times.push(ms);
  sfx.hit(ms);
  readout(ms);
  renderPips();
  return ms;
}
function floatText(x, y, text, color) {
  const r = stage.getBoundingClientRect(), el = document.createElement('div');
  el.className = 'float'; el.textContent = text; el.style.color = color;
  el.style.left = x - r.left + 'px'; el.style.top = y - r.top + 'px';
  stage.append(el); setTimeout(() => el.remove(), 900);
}
function missMark(x, y) {
  const r = stage.getBoundingClientRect(), el = document.createElement('div');
  el.className = 'miss'; el.textContent = '×';
  el.style.left = x - r.left + 'px'; el.style.top = y - r.top + 'px';
  stage.append(el); setTimeout(() => el.remove(), 700);
}
function shake(el = play) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }

function falseStart(guess) {
  clearTimeout(run.timer);
  run.falseStarts++;
  sfx.bad(); shake();
  stage.replaceChildren();
  setPhase('pause');
  message('Too soon!', guess ? 'Under 100 ms is a guess, not a reaction.' : 'Wait for the signal.');
  after(1300, () => { message(''); next(); });
}
function next() {
  if (run.times.length >= run.M.rounds) return finish();
  renderPips();
  ROUNDS[run.mode]();
}
function centre() { const r = stage.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }
function place(el, size, avoid) {
  const r = stage.getBoundingClientRect();
  let x, y, tries = 0;
  do { x = rand(0, r.width - size); y = rand(0, r.height - size); }
  while (avoid && Math.hypot(x - avoid[0], y - avoid[1]) < Math.min(r.width, r.height) * 0.3 && ++tries < 20);
  Object.assign(el.style, { left: x + 'px', top: y + 'px', width: size + 'px', height: size + 'px' });
  return [x, y];
}
const fixation = () => { const f = document.createElement('div'); f.className = 'fix'; f.textContent = '+'; stage.replaceChildren(f); };

// Each mode: how a round is set up, and what a press means.
const ROUNDS = {
  flash() {
    setPhase('wait');
    message('Wait', 'for green');
    after(rand(1500, 5000), () => { setPhase('go'); message('Now!'); stamp(); });
  },
  classic() {
    setPhase('wait');
    after(rand(500, 2600), () => {
      const el = document.createElement('div'), color = `hsl(${Math.floor(rand(0, 360))} 90% 60%)`;
      el.className = 'shape' + (Math.random() < 0.5 ? ' circle' : '');
      el.style.background = color;
      place(el, Math.round(Math.min(140, Math.max(64, Math.min(innerWidth, innerHeight) * 0.13))));
      stage.append(el);
      run.stim = { el, color };
      setPhase('go'); stamp();
    });
  },
  arrows() {
    setPhase('wait');
    fixation();
    after(rand(800, 2400), () => {
      const dir = pick(['up', 'down', 'left', 'right']), el = document.createElement('div');
      el.className = 'arrow'; el.dataset.dir = dir;
      el.innerHTML = '<svg viewBox="0 0 100 100"><path d="M50 8 90 52H64v40H36V52H10z" fill="currentColor"/></svg>';
      stage.replaceChildren(el);
      run.stim = { el, dir };
      setPhase('go'); stamp();
    });
  },
  aim() {
    const spawn = () => {
      const el = document.createElement('div');
      el.className = 'target';
      const size = Math.round(Math.min(64, Math.max(40, Math.min(innerWidth, innerHeight) * 0.07)));
      const pos = place(el, size, run.stim?.pos);
      stage.append(el);
      run.stim = { el, pos };
      setPhase('go'); stamp();
    };
    if (run.times.length) return spawn();
    setPhase('wait');
    message('Ready');
    after(800, () => { message(''); spawn(); });
  },
  gonogo() {
    setPhase('wait');
    fixation();
    const nogo = Math.random() < 0.3;
    after(rand(800, 2200), () => {
      const el = document.createElement('div');
      el.className = 'gng ' + (nogo ? 'nogo' : 'go');
      stage.replaceChildren(el);
      run.stim = { el, nogo };
      setPhase('go'); stamp();
      after(nogo ? 900 : 1000, () => {
        stage.replaceChildren();
        if (nogo) { sfx.soft(); setPhase('pause'); message('', 'Good hold'); after(500, () => { message(''); next(); }); }
        else { record(1000); setPhase('pause'); message('Too slow', 'Counted as 1000 ms'); after(1100, () => { message(''); next(); }); }
      });
    });
  },
};

const DIRS = { arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down', arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right' };

const PRESS = {
  flash(inp) {
    if (run.phase === 'wait') return falseStart();
    if (run.phase !== 'go') return;
    const rt = inp.t - run.shownAt;
    if (rt < 100) return falseStart(true);
    record(rt);
    burst(inp.x ?? innerWidth / 2, inp.y ?? innerHeight / 2, '#c8ff2e', 22, 1.4);
    setPhase('pause'); message('');
    after(1200, next);
  },
  classic(inp) {
    if (inp.type !== 'pointer') return;
    run.clicks++;
    if (run.phase === 'go' && inp.target === run.stim.el) {
      const rt = inp.t - run.shownAt;
      if (rt < 100) return falseStart(true);
      const ms = record(rt);
      burst(inp.x, inp.y, run.stim.color);
      floatText(inp.x, inp.y, ms, run.stim.color);
      run.stim.el.remove();
      return next();
    }
    run.misses++; missMark(inp.x, inp.y);
  },
  arrows(inp) {
    if (inp.type !== 'key') return;
    const dir = DIRS[inp.key.toLowerCase()];
    if (!dir) return;
    if (run.phase === 'wait') return falseStart();
    if (run.phase !== 'go') return;
    if (dir !== run.stim.dir) {
      run.errors++; run.penalty += 200;
      sfx.bad(); shake(run.stim.el);
      const [x, y] = centre(); floatText(x, y - 160, '+200', '#ff3d2e');
      return;
    }
    const rt = inp.t - run.shownAt;
    if (rt < 100) return falseStart(true);
    record(rt);
    run.stim.el.classList.add('ok');
    burst(...centre(), '#c8ff2e', 22);
    setPhase('pause');
    after(350, next);
  },
  aim(inp) {
    if (inp.type !== 'pointer' || run.phase !== 'go') return;
    run.clicks++;
    if (inp.target === run.stim.el) {
      record(inp.t - run.shownAt);
      burst(inp.x, inp.y, '#4de3ff', 14);
      run.stim.el.remove();
      return next();
    }
    run.misses++; missMark(inp.x, inp.y);
  },
  gonogo(inp) {
    if (run.phase === 'wait') return falseStart();
    if (run.phase !== 'go') return;
    clearTimeout(run.timer);
    stage.replaceChildren();
    setPhase('pause');
    if (run.stim.nogo) {
      run.errors++; run.penalty += 300;
      sfx.bad(); shake();
      message('Hold it!', '+300 ms on your next go');
      return after(1200, () => { message(''); next(); });
    }
    const rt = inp.t - run.shownAt;
    if (rt < 100) return falseStart(true);
    record(rt);
    burst(inp.x ?? centre()[0], inp.y ?? centre()[1], '#c8ff2e', 22);
    after(500, next);
  },
};

function press(inp) {
  if (!run) return;
  if (run.phase === 'intro') { message(''); return next(); }
  if (run.phase === 'pause' || run.phase === 'done') return;
  PRESS[run.mode](inp);
}

play.addEventListener('pointerdown', (e) => {
  if (screen !== 'play' || e.button > 0) return;
  const pad = e.target.closest('[data-key]');
  if (pad) { e.preventDefault(); return press({ type: 'key', key: pad.dataset.key, t: e.timeStamp }); }
  if (e.target.closest('button')) return;
  press({ type: 'pointer', t: e.timeStamp, x: e.clientX, y: e.clientY, target: e.target });
});
play.addEventListener('contextmenu', (e) => e.preventDefault());

// ───────── results ─────────
let last = null;

function finish() {
  clearTimeout(run.timer);
  setPhase('done');
  const { mode, M, times } = run;
  const avg = Math.round(mean(times));
  const prevPb = pbs[mode];
  const isPb = !prevPb || avg < prevPb;
  if (isPb) { pbs[mode] = avg; store.set('pb', pbs); renderMenu(); }
  last = {
    mode, M, times: times.slice(), avg, isPb, prevPb,
    best: Math.min(...times), worst: Math.max(...times), sd: Math.round(stdev(times)),
    falseStarts: run.falseStarts, misses: run.misses, clicks: run.clicks, errors: run.errors,
  };
  renderResults(last);
  show('results');
  if (isPb) { sfx.fanfare(); setTimeout(confetti, 250); }
  submit(last);
}

function renderResults(r) {
  const tier = tierOf(r.mode, r.avg), t = TIER_COLORS[tier];
  const res = $('#results');
  res.style.setProperty('--c', r.M.color);
  res.style.setProperty('--t', t);
  res.classList.toggle('is-pb', r.isPb);
  $('#res-mode').textContent = `${r.M.name} · ${r.times.length} rounds`;
  $('#res-avg').textContent = r.avg;
  $('#res-tier b').textContent = TIERS[tier][0];
  $('#res-tier span').textContent = TIERS[tier][1];
  $('#res-pb').textContent = r.prevPb ? `New personal best · was ${r.prevPb} ms` : 'First run · personal best set';

  const stats = [['Best', r.best, 'ms'], ['Worst', r.worst, 'ms'], ['Consistency', '±' + r.sd, 'ms'], ['False starts', r.falseStarts]];
  if (r.mode === 'classic' || r.mode === 'aim') stats.push(['Accuracy', r.clicks ? Math.round((100 * (r.clicks - r.misses)) / r.clicks) : 100, '%']);
  if (r.mode === 'arrows' || r.mode === 'gonogo') stats.push(['Errors', r.errors]);
  $('#res-stats').replaceChildren(...stats.map(([k, v, u]) => {
    const d = document.createElement('div');
    d.innerHTML = `<dt>${k}</dt><dd>${v}${u ? `<small>${u}</small>` : ''}</dd>`;
    return d;
  }));

  const max = r.worst * 1.08, chart = $('#res-chart');
  chart.classList.toggle('dense', r.times.length > 12);
  chart.replaceChildren(...r.times.map((ms, i) => {
    const c = document.createElement('div');
    c.className = 'col';
    c.style.setProperty('--h', (ms / max) * 100 + '%');
    c.style.setProperty('--i', i);
    c.style.setProperty('--t', TIER_COLORS[tierOf(r.mode, ms)]);
    c.title = `Round ${i + 1}: ${ms} ms`;
    c.innerHTML = `<i></i><span>${ms}</span><b>${i + 1}</b>`;
    return c;
  }));
  const avgLine = document.createElement('div');
  avgLine.className = 'avg';
  avgLine.style.setProperty('--h', `calc((100% - 44px) * ${r.avg / max})`);
  chart.append(avgLine);

  // result card
  $('#rc-name').textContent = playerName;
  avatar($('#rcard .av'), playerName);
  $('#rc-pill').innerHTML = `${r.avg}<small>ms</small>`;
  setCard({ rank: '…', label: 'Ranking', value: 'checking the board', pct: 0 });
}

const MEDALS = ['#ffd25e', '#cfd6de', '#e3905d'];
function setCard({ rank, label, value, pct, ring }) {
  $('#rc-rank').textContent = rank;
  $('#rcard').style.setProperty('--ring', ring || 'var(--c)');
  $('#rc-prog-label').textContent = label;
  $('#rc-prog-val').textContent = value;
  requestAnimationFrame(() => { $('#rc-prog-bar').style.width = pct + '%'; });
}

async function submit(r) {
  setCard({ rank: '…', label: 'Ranking', value: 'submitting', pct: 0 });
  try {
    const res = await fetch('/api/scores', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: r.mode, player, name: playerName, times: r.times }),
    });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    boards[r.mode] = data;
    if (r !== last) return;
    const { rank, total } = data.run;
    const pct = total > 1 ? Math.round(((total - rank) / (total - 1)) * 100) : 100;
    setCard({
      rank: '#' + rank, ring: MEDALS[rank - 1],
      label: total > 1 ? 'Faster than' : 'First on the board',
      value: total > 1 ? `${pct}% of ${total} players` : 'nobody to beat yet', pct,
    });
  } catch {
    if (r === last) setCard({ rank: '–', label: 'Leaderboard offline', value: 'saved locally', pct: r.prevPb ? Math.min(100, (r.prevPb / r.avg) * 100) : 100 });
  }
}

function copyResult() {
  if (!last) return;
  const tier = TIERS[tierOf(last.mode, last.avg)];
  const bars = last.times.map((ms) => ['⚡', '🟩', '🟨', '🟧', '🟥'][tierOf(last.mode, ms)]).join('');
  const text = `Test Your Reaction! · ${last.M.name}\n${last.avg} ms avg · best ${last.best} ms · ${tier[0]} ${tier[1]}\n${bars}\n${location.origin}`;
  navigator.clipboard?.writeText(text).then(() => toast('Result copied'), () => toast('Copy failed'));
}

// ───────── name ─────────
const dlg = $('#name-dlg');
function askName() {
  if (dlg.open) return;
  $('#name-input').value = playerName;
  dlg.showModal();
}
dlg.addEventListener('close', () => {
  const v = $('#name-input').value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 16);
  const save = dlg.returnValue === 'save';
  dlg.returnValue = '';
  if (!save || !v || v === playerName) return;
  playerName = v; store.set('name', v); renderName();
  toast(`Playing as ${playerName}`);
  // resubmitting is how the server learns the new name (it renames all of this player's rows)
  if (last) { $('#rc-name').textContent = playerName; avatar($('#rcard .av'), playerName); submit(last); }
});

// ───────── leaderboard (after 21st.dev "Leaderboard Table": bars, ± whiskers, rows morph by rank) ─────────
const boards = {};
let boardMode = 'flash';
const ROW_H = 52;
const rowEls = new Map();

function niceMax(v) {
  const step = [10, 20, 25, 50, 100, 200, 250, 500, 1000].find((s) => v / s <= 5) || 1000;
  return { max: Math.ceil(v / step) * step, step };
}

function openBoard(mode = boardMode) {
  boardMode = mode;
  show('board');
  renderTabs();
  if (boards[mode]) renderBoard(boards[mode]);
  else $('#lb-meta').textContent = 'Loading…';
  loadBoard(mode);
}
async function loadBoard(mode) {
  try {
    const res = await fetch(`/api/scores?mode=${mode}&player=${player}`);
    if (!res.ok) throw new Error(res.status);
    boards[mode] = await res.json();
    if (screen === 'board' && boardMode === mode) renderBoard(boards[mode]);
  } catch {
    if (boardMode === mode && !boards[mode]) renderBoard(null);
  }
}
function renderTabs() {
  $('#lb-tabs').replaceChildren(...Object.entries(MODES).map(([id, M]) => {
    const b = document.createElement('button');
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', id === boardMode);
    b.innerHTML = `<kbd>${M.key}</kbd>`;
    b.append(M.name);
    b.addEventListener('click', () => openBoard(id));
    return b;
  }));
}

function boardRow(r, rank, axis, enter, delay) {
  const el = document.createElement('div');
  el.className = 'lb-row' + (r.you ? ' you' : '') + (enter ? ' enter' : '');
  el.innerHTML = '<span class="lb-rank"></span><span class="lb-player"><i class="av"></i><b></b></span><span class="lb-barbox"><i class="lb-track"></i><i class="lb-bar"></i><span class="lb-wh"><i></i></span></span><span class="lb-score"><b></b><small></small></span><span class="lb-best"></span>';
  fillRow(el, r, rank, axis);
  el.style.setProperty('--d', delay + 'ms');
  return el;
}
function fillRow(el, r, rank, axis) {
  el.classList.toggle('you', !!r.you);
  el.querySelector('.lb-rank').textContent = rank;
  el.style.setProperty('--medal', MEDALS[rank - 1] || 'var(--mute)');
  const p = el.querySelector('.lb-player');
  p.querySelector('b').textContent = r.name;
  p.querySelector('em')?.remove();
  if (r.you) p.insertAdjacentHTML('beforeend', '<em>YOU</em>');
  avatar(p.querySelector('.av'), r.name);
  el.style.setProperty('--av', look(r.name).color); // bar colour follows the player
  const pct = (v) => Math.max(0, Math.min(100, (v / axis) * 100)) + '%';
  el.querySelector('.lb-bar').style.width = pct(r.score);
  const wh = el.querySelector('.lb-wh');
  wh.style.left = pct(Math.max(0, r.score - r.sd));
  wh.style.width = `calc(${pct(Math.min(axis, r.score + r.sd))} - ${pct(Math.max(0, r.score - r.sd))})`;
  el.querySelector('.lb-score b').textContent = r.score;
  el.querySelector('.lb-score small').textContent = 'ms ±' + r.sd;
  el.querySelector('.lb-best').textContent = r.best;
}

function renderBoard(data) {
  const box = $('#lb-rows'), pinned = $('#lb-pinned'), ticks = $('#lb-axis');
  pinned.replaceChildren();
  if (!data || !data.top.length) {
    rowEls.clear();
    box.style.height = 'auto';
    box.innerHTML = data
      ? '<div class="lb-empty"><b>Empty board</b>Nobody has played this mode yet. Be the first.</div>'
      : '<div class="lb-empty"><b>Offline</b>Couldn’t reach the leaderboard. Your personal bests are saved on this device.</div>';
    ticks.replaceChildren();
    $('#lb-meta').textContent = data ? '0 players' : '';
    return;
  }
  box.querySelector('.lb-empty')?.remove();
  const rows = data.top;
  const { max: axis, step } = niceMax(Math.max(...rows.map((r) => r.score + r.sd), data.me ? data.me.score + data.me.sd : 0) * 1.02);

  // key rows by name so the same player slides to their new rank between modes
  const seen = new Map(), keep = new Set();
  rows.forEach((r, i) => {
    const n = (seen.get(r.name) || 0) + 1; seen.set(r.name, n);
    const key = r.name + '#' + n;
    keep.add(key);
    let el = rowEls.get(key);
    if (el) { el.classList.remove('leaving', 'enter'); fillRow(el, r, i + 1, axis); }
    else { el = boardRow(r, i + 1, axis, true, Math.min(i, 20) * 45); rowEls.set(key, el); box.append(el); }
    el.style.transform = `translateY(${i * ROW_H}px)`;
  });
  for (const [key, el] of rowEls) {
    if (keep.has(key)) continue;
    rowEls.delete(key);
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 260);
  }
  box.style.height = rows.length * ROW_H + 'px';

  if (data.me && !rows.some((r) => r.you)) pinned.append(boardRow({ ...data.me, you: true }, data.me.rank, axis, true, 0));

  const tickBox = document.createElement('div');
  tickBox.className = 'lb-ticks';
  for (let t = 0; t <= axis; t += step) {
    const s = document.createElement('span');
    s.style.left = (t / axis) * 100 + '%';
    s.textContent = t;
    tickBox.append(s);
  }
  ticks.replaceChildren(document.createElement('span'), document.createElement('span'), tickBox);
  $('#lb-meta').textContent = `${data.total} player${data.total === 1 ? '' : 's'} · ${MODES[boardMode].rounds} rounds a run`;
}

// ───────── actions + keys ─────────
const ACTIONS = {
  menu: () => { if (run) clearTimeout(run.timer); run = null; show('menu'); },
  back: () => (backTo === 'results' && last ? show('results') : ACTIONS.menu()),
  board: () => openBoard(screen === 'results' && last ? last.mode : boardMode),
  retry: () => last && startRun(last.mode),
  copy: copyResult,
  rename: askName,
  sound: () => { soundOn = !soundOn; store.set('sound', soundOn); renderSound(); toast(soundOn ? 'Sound on' : 'Sound off'); },
};
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (b) ACTIONS[b.dataset.act]();
});

addEventListener('keydown', (e) => {
  if (dlg.open || e.target.matches('input')) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();

  if (screen === 'play') {
    if (k === 'escape') return ACTIONS.menu();
    if (e.repeat) return;
    if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
    return press({ type: 'key', key: e.key, t: e.timeStamp });
  }
  if (k === 'm') return ACTIONS.sound();
  if (k === 'n') { e.preventDefault(); return askName(); }
  const mode = Object.keys(MODES).find((id) => MODES[id].key === k);

  if (screen === 'menu') {
    if (mode) return startRun(mode);
    if (k === 'l') return ACTIONS.board();
  } else if (screen === 'results') {
    if ((k === 'enter' || k === ' ') && e.target.closest('button')) return;
    if (k === 'r' || k === 'enter' || k === ' ') { e.preventDefault(); return ACTIONS.retry(); }
    if (k === 'l') return ACTIONS.board();
    if (k === 'c') return copyResult();
    if (k === 'escape' || k === 'backspace') return ACTIONS.menu();
    if (mode) return startRun(mode);
  } else if (screen === 'board') {
    if (mode) return openBoard(mode);
    if (k === 'escape' || k === 'backspace' || k === 'l') return ACTIONS.back();
  }
});

renderMenu();
renderName();
renderSound();
