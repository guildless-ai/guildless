import { analyze, totalInk } from './analyze.js';
import { phaseAt, poseOf } from './anim.js';
import { Arena2D } from './arena2d.js';
import { Arena3D } from './arena3d.js';
import { ARENA_W, makeFighter, simulate, type BattleEvent, type Fighter } from './battle.js';
import { generateEnemy } from './enemy.js';
import { afterWave, idleBudget, loadIdle, newIdle, saveIdle, type IdleState } from './idle.js';
import { loadGallery, pickRival, saveWinner } from './gallery.js';
import { applyPerks, offerPerks, type Perk } from './perks.js';
import { CSS, drawDrawing, makeFrameFactory } from './render.js';
import { mulberry32 } from './rng.js';
import { applyResult, inkBudget, MAX_ROUNDS, newRun, type RunState } from './run.js';
import { decodeDrawing, encodeDrawing } from './share.js';
import { segmentParts } from './parts.js';
import { Sfx } from './sfx.js';
import type { Color, Drawing, Point, Stats, Stroke } from './types.js';
import type { ArenaRenderer, FighterView, Popup } from './view.js';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const pad = $<HTMLCanvasElement>('pad');
const arena = $<HTMLCanvasElement>('arena');
const padCtx = pad.getContext('2d')!;
const renderer: ArenaRenderer = Arena3D.supported(arena) ? new Arena3D(arena) : new Arena2D(arena);
$('rendermode').textContent = renderer instanceof Arena3D ? '3D' : '2D';

let run: RunState = newRun();
let drawing: Drawing = { strokes: [], width: pad.width, height: pad.height };
let current: Stroke | null = null;
let color: Color = 'black';
let penWidth = 8;
let enemy = generateEnemy(run.round, inkBudget(run.round), run.seed);
const sfx = new Sfx();
let busy = false;
/** A doodle pasted from a share code; used as the next enemy instead of a generated one. */
let challenger: { name: string; drawing: Drawing } | null = null;

const budget = () => inkBudget(run.round, applyPerks(run.perks).inkBonus);

// ---------- drawing pad ----------
function canvasPoint(e: PointerEvent): Point {
  const r = pad.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * pad.width, y: ((e.clientY - r.top) / r.height) * pad.height };
}

pad.addEventListener('pointerdown', (e) => {
  if (busy || remainingInk() <= 0) return;
  pad.setPointerCapture(e.pointerId);
  current = { points: [canvasPoint(e)], color, width: penWidth };
  drawing.strokes.push(current);
  redrawPad();
});
pad.addEventListener('pointermove', (e) => {
  if (!current) return;
  const p = canvasPoint(e);
  const last = current.points[current.points.length - 1];
  const segCost = Math.hypot(p.x - last.x, p.y - last.y) * current.width;
  if (remainingInk() - segCost < 0) { current = null; redrawPad(); return; }
  current.points.push(p);
  redrawPad();
});
const endStroke = () => { current = null; redrawPad(); };
pad.addEventListener('pointerup', endStroke);
pad.addEventListener('pointercancel', endStroke);

function remainingInk(): number {
  return budget() - totalInk(drawing);
}

function redrawPad(): void {
  padCtx.clearRect(0, 0, pad.width, pad.height);
  drawDrawing(padCtx, drawing);
  const total = budget();
  const left = Math.max(0, remainingInk());
  $('inkbar').style.width = `${(left / total) * 100}%`;
  $('inktext').textContent = `${Math.round(left)} / ${total}`;
  renderStats($('mystats'), drawing.strokes.length ? analyze(drawing) : null);
  $<HTMLButtonElement>('fight').disabled = busy || drawing.strokes.length === 0;
}

function renderStats(el: HTMLElement, s: Stats | null): void {
  if (!s) { el.innerHTML = ''; return; }
  el.innerHTML = [
    `<div>HP ${s.hp}</div>`, `<div>攻撃 ${s.atk}</div>`, `<div>速さ ${s.spd}/s</div>`,
    `<div>リーチ ${s.reach}</div>`, `<div style="color:${CSS[s.element]}">属性 ${jp(s.element)} (トゲ${s.spikes})</div>`,
    `<div style="grid-column: 1 / -1">${traitTags(s)}</div>`,
  ].join('');
}

/** Human-readable tags for shape traits so players learn what drawing choices do. */
function traitTags(s: Stats): string {
  const tags: string[] = [];
  if (s.armor > 0) tags.push(`盾${s.armor}（輪 → 被ダメ -${s.armor}）`);
  if (s.traits.eyes > 0) tags.push(`目${s.traits.eyes}（クリ +${Math.round(s.critBonus * 100)}%）`);
  if (s.traits.legs > 0) tags.push(`脚${s.traits.legs}（速さ +${(Math.min(4, s.traits.legs) * 0.1).toFixed(1)}）`);
  if (s.traits.arms > 0) tags.push(`腕${s.traits.arms}（攻撃 +${Math.min(4, s.traits.arms) * 2}）`);
  return tags.length ? tags.join(' ・ ') : '形の特性なし（輪・目・脚・腕を描くと付く）';
}

function jp(c: Color): string {
  return { black: '黒', red: '赤', green: '緑', blue: '青' }[c];
}

// palette
const palette = $('palette');
(['black', 'red', 'green', 'blue'] as Color[]).forEach((c) => {
  const b = document.createElement('div');
  b.className = 'swatch' + (c === color ? ' active' : '');
  b.style.background = CSS[c];
  b.title = jp(c);
  b.onclick = () => { color = c; palette.querySelectorAll('.swatch').forEach((x) => x.classList.remove('active')); b.classList.add('active'); };
  palette.appendChild(b);
});
[4, 8, 14].forEach((w) => {
  const b = document.createElement('button');
  b.textContent = w === 4 ? '細' : w === 8 ? '中' : '太';
  b.onclick = () => { penWidth = w; };
  palette.appendChild(b);
});

// ---------- idle (second-monitor) mode ----------
let idle: IdleState | null = null;
let idleTimer = 0;

/** Enter idle mode: wide strip, your doodle (or a past winner) fights endless waves. */
function enterIdle(): void {
  if (busy || idle) return;
  if (drawing.strokes.length === 0) {
    const g = loadGallery(localStorage);
    const pick = g.length ? pickRival(g, 99, mulberry32(Date.now() % 100000)) ?? pickRival(g, g[g.length - 1].round, mulberry32(1)) : null;
    if (!pick) { log('放置モードには絵が要る。何か描くか一勝してから'); return; }
    drawing = pick.drawing;
  }
  idle = loadIdle(localStorage) ?? newIdle();
  document.body.classList.add('idle');
  arena.width = 960; arena.height = 220;
  renderer.resize();
  redrawPad();
  idleWave();
}

function exitIdle(): void {
  if (!idle) return;
  clearTimeout(idleTimer);
  sfx.enabled = true;
  idle = null;
  document.body.classList.remove('idle');
  arena.width = 480; arena.height = 300;
  renderer.resize();
  busy = false;
  startRound(false, true);
}

function idleWave(): void {
  if (!idle) return;
  const st = idle;
  const a = makeFighter('あなたの絵', structuredClone(drawing), 60, applyPerks(run.perks));
  const foe = generateEnemy(Math.min(10, 1 + Math.floor((st.wave - 1) / 2)), idleBudget(st.wave), st.seed + st.wave * 101);
  const b = makeFighter(`${foe.name} (wave ${st.wave})`, foe.drawing, ARENA_W - 60);
  const result = simulate(a, b, st.seed + st.wave);
  sfx.enabled = false;
  busy = true;
  $('idlestats').textContent = `wave ${st.wave} ・ ${st.wins} 勝 ・ 連勝 ${st.streak}（最高 ${st.bestStreak}）`;
  replay(a, b, result.events, () => {
    busy = false;
    banner(null);
    if (!idle) return;
    idle = afterWave(idle, result.winner);
    saveIdle(localStorage, idle);
    $('idlestats').textContent = `wave ${idle.wave} ・ ${idle.wins} 勝 ・ 連勝 ${idle.streak}（最高 ${idle.bestStreak}）`;
    idleTimer = window.setTimeout(idleWave, 1200);
  });
}

$('idle').onclick = enterIdle;
$('idleexit').onclick = exitIdle;

// Inside the Electron shell a separate always-on-top strip window is available.
const desktop = (window as unknown as { rakugakiDesktop?: { openIdle(): void; closeIdle(): void } }).rakugakiDesktop;
if (desktop) {
  const b = $<HTMLButtonElement>('idlewindow');
  b.hidden = false;
  b.onclick = () => desktop.openIdle();
}

$('undo').onclick = () => { drawing.strokes.pop(); redrawPad(); };
$('clear').onclick = () => { drawing.strokes = []; redrawPad(); };
$('restart').onclick = () => { run = newRun(); startRound(true); };
$('next').onclick = () => startRound(false);

// ---------- battle ----------
function viewOf(f: Fighter): FighterView {
  const ff = makeFrameFactory(f.drawing, f.stats.bbox);
  return { name: f.name, color: CSS[f.stats.element], width: ff.width, height: ff.height, frame: ff.frame };
}

$('fight').onclick = () => {
  if (busy || drawing.strokes.length === 0) return;
  sfx.unlock();
  busy = true;
  $<HTMLButtonElement>('fight').disabled = true;
  const a = makeFighter('あなた', structuredClone(drawing), 60, applyPerks(run.perks));
  const b = makeFighter(enemy.name, structuredClone(enemy.drawing), ARENA_W - 60);
  const result = simulate(a, b, run.seed + run.round);
  log(`ラウンド ${run.round}: ${a.name} (${a.stats.hp}HP/${a.stats.atk}ATK) vs ${b.name} (${b.stats.hp}HP/${b.stats.atk}ATK)`);
  replay(a, b, result.events, () => {
    const wonRound = run.round;
    run = applyResult(run, result.winner);
    log(result.winner === 'a' ? '勝ち！' : result.winner === 'b' ? '負け…' : '相打ち');
    banner(null);
    if (result.winner === 'a') saveWinner(localStorage, a.drawing, wonRound);
    busy = false;
    updateStatus();
    if (run.over) {
      log(run.lives <= 0 ? `ゲームオーバー。${run.wins} 勝` : `完走！ ${run.wins} 勝 / ${MAX_ROUNDS} 戦`);
      $<HTMLButtonElement>('next').disabled = true;
    } else if (result.winner === 'a') {
      showPerks();
    } else {
      $<HTMLButtonElement>('next').disabled = false;
    }
  });
};

/**
 * Replay the event log: fighters walk in, poses come from anim.ts, the
 * renderer (3D paper cutouts or 2D fallback) draws each frame, the HUD is DOM.
 */
function replay(a: Fighter, b: Fighter, events: BattleEvent[], done: () => void): void {
  renderer.setFighters(viewOf(a), viewOf(b));
  const hpA0 = a.stats.hp, hpB0 = b.stats.hp;
  let hpA = hpA0, hpB = hpB0;
  let xA = 60, xB = ARENA_W - 60;
  let i = 0;
  const popups: Popup[] = [];
  let shake = 0;
  let flash: 'a' | 'b' | null = null;
  let flashLife = 0;
  let pauseUntil = 0; // hitstop: replay clock frozen until this wall time
  let frozen = 0;
  let lastNow = performance.now();
  const start = lastNow;
  let finished = false;
  let endAt = Infinity;
  let nextSwing = 0; // index into events of the next attack whose wind-up has not played
  const swingLead = 0.22;
  hud(a.name, b.name, CSS[a.stats.element], CSS[b.stats.element], 1, 1);

  const frame = (now: number) => {
    if (now < pauseUntil) { frozen += (now - lastNow) / 1000; lastNow = now; }
    else lastNow = now;
    const t = (now - start) / 1000 - frozen;
    // Wind-up whoosh slightly before each hit lands.
    while (nextSwing < events.length && events[nextSwing].t - swingLead <= t) {
      if (events[nextSwing].kind === 'hit') sfx.swing();
      nextSwing++;
    }
    while (!finished && i < events.length && events[i].t <= t) {
      const ev = events[i++];
      if (ev.kind === 'hit') {
        const big = ev.crit || ev.mult > 1;
        sfx.hit(big);
        shake = big ? 8 : 3;
        flash = ev.from === 'a' ? 'b' : 'a';
        flashLife = 0.12;
        if (big) pauseUntil = now + 90;
        const text = (ev.crit ? '!! ' : '') + ev.dmg + (ev.mult > 1 ? ' 効果大' : ev.mult < 1 ? ' いまいち' : '');
        if (ev.from === 'a') { hpB -= ev.dmg; popups.push({ x: xB, text, color: CSS[a.stats.element], life: 1 }); }
        else { hpA -= ev.dmg; popups.push({ x: xA, text, color: CSS[b.stats.element], life: 1 }); }
      } else {
        finished = true;
        endAt = t + 2.2; // KO topple, then the winner's victory hops
        if (ev.winner === 'a') { sfx.win(); banner('勝ち！', CSS[a.stats.element]); }
        else if (ev.winner === 'b') { sfx.lose(); banner('負け…', '#8a8378'); }
        else banner('相打ち', '#8a8378');
      }
    }
    // Walk until within reach (mirrors the simulation).
    const gap = xB - xA;
    const dt = 1 / 60;
    let movedA = false, movedB = false;
    if (!finished) {
      if (gap > a.stats.reach) { xA += 90 * dt; movedA = true; }
      if (gap > b.stats.reach) { xB -= 90 * dt; movedB = true; }
    }
    flashLife = Math.max(0, flashLife - dt);
    for (const p of popups) p.life -= dt * 0.9;
    while (popups.length && popups[0].life <= 0) popups.shift();
    const phaseA = phaseAt(events, 'a', t, movedA), phaseB = phaseAt(events, 'b', t, movedB);
    renderer.draw({
      t, xA, xB,
      poseA: poseOf(phaseA), poseB: poseOf(phaseB), phaseA, phaseB,
      hpA, hpB, hpA0, hpB0, popups, shake,
      flashA: flash === 'a' && flashLife > 0,
      flashB: flash === 'b' && flashLife > 0,
    });
    shake = Math.max(0, shake - 0.6);
    hud(a.name, b.name, CSS[a.stats.element], CSS[b.stats.element], hpA / hpA0, hpB / hpB0);
    if (t >= endAt) { done(); return; }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** Big result text over the arena; null hides it. */
function banner(text: string | null, color = '#222'): void {
  const el = $('banner');
  if (!text) { el.hidden = true; return; }
  el.textContent = text;
  el.style.color = color;
  el.hidden = false;
  el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
}

function hud(nameA: string, nameB: string, colA: string, colB: string, ratioA: number, ratioB: number): void {
  $('nameA').textContent = nameA; $('nameB').textContent = nameB;
  $('hpA').style.width = `${Math.max(0, ratioA) * 100}%`; $('hpA').style.background = colA;
  $('hpB').style.width = `${Math.max(0, ratioB) * 100}%`; $('hpB').style.background = colB;
}

function log(line: string): void {
  const el = $('log');
  el.textContent = line + '\n' + (el.textContent ?? '');
}

/** After a win the player picks one of three perks before the next round. */
function showPerks(): void {
  const box = $('perks');
  box.innerHTML = '';
  box.hidden = false;
  const offers: Perk[] = offerPerks(mulberry32(run.seed * 31 + run.round));
  for (const perk of offers) {
    const b = document.createElement('button');
    b.className = 'perk';
    b.innerHTML = `<strong>${perk.name}</strong><small>${perk.desc}</small>`;
    b.onclick = () => {
      run = { ...run, perks: [...run.perks, perk.id] };
      log(`アップグレード: ${perk.name}`);
      box.hidden = true;
      startRound(false);
    };
    box.appendChild(b);
  }
}

// ---------- share codes ----------
$('copycode').onclick = async () => {
  if (drawing.strokes.length === 0) { $('copied').textContent = 'まず何か描いて'; return; }
  const code = encodeDrawing(drawing);
  try { await navigator.clipboard.writeText(code); $('copied').textContent = `コピーした (${code.length}文字)`; }
  catch { $<HTMLInputElement>('pastecode').value = code; $('copied').textContent = '下の欄に出した'; }
};
$('usecode').onclick = () => {
  const code = $<HTMLInputElement>('pastecode').value;
  try {
    const d = decodeDrawing(code);
    if (d.strokes.length === 0) throw new Error('empty drawing');
    challenger = { name: 'ともだちの絵', drawing: d };
    log('次のラウンドは共有コードの絵と対戦');
    if (!busy) startRound(false, true);
  } catch (e) {
    log(`コードを読めない: ${(e as Error).message}`);
  }
};

function startRound(fresh: boolean, keepDrawing = false): void {
  if (fresh) $('log').textContent = '';
  if (!keepDrawing) drawing = { strokes: [], width: pad.width, height: pad.height };
  $('perks').hidden = true;
  if (challenger) { enemy = challenger; challenger = null; }
  else {
    // Every third round from round 2 on, a past winner of yours comes back as a rival.
    const rival = run.round >= 2 && run.round % 3 === 2
      ? pickRival(loadGallery(localStorage), run.round, mulberry32(run.seed * 17 + run.round))
      : null;
    enemy = rival
      ? { name: `むかしの自分 (R${rival.entry.round})`, drawing: rival.drawing }
      : generateEnemy(run.round, inkBudget(run.round), run.seed);
  }
  $<HTMLButtonElement>('next').disabled = true;
  const b = makeFighter(enemy.name, enemy.drawing, ARENA_W - 60);
  renderStats($('enemystats'), b.stats);
  renderer.preview(viewOf(b), ARENA_W - 60);
  hud('', `次の相手: ${enemy.name}`, '#222', CSS[b.stats.element], 0, 1);
  updateStatus();
  redrawPad();
}

function updateStatus(): void {
  const perks = run.perks.length ? ` ・ 強化 ${run.perks.length}` : '';
  $('status').textContent = `ラウンド ${Math.min(run.round, MAX_ROUNDS)}/${MAX_ROUNDS} ・ 残機 ${'♥'.repeat(run.lives)} ・ ${run.wins} 勝${perks}`;
  $('roundinfo').textContent = `seed ${run.seed}`;
}

startRound(true);
if (new URLSearchParams(location.search).has('idle')) enterIdle();

// Debug surface for automated tests: inspect the current doodle's segmentation.
(window as unknown as { __rakugaki: unknown }).__rakugaki = {
  parts: () => segmentParts(drawing),
  drawing: () => drawing,
  frame: (t: number, kind: 'walk' | 'idle' | 'attack' | 'hit' | 'ko' | 'win', u: number) => makeFrameFactory(drawing, analyze(drawing).bbox).frame(t, { kind, u, big: false }).toDataURL(),
};
