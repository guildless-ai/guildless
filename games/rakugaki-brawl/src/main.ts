import { analyze, totalInk } from './analyze.js';
import { phaseAt, poseOf } from './anim.js';
import { Arena2D } from './arena2d.js';
import { Arena3D } from './arena3d.js';
import { ARENA_W, makeFighter, simulate, type BattleEvent, type Fighter } from './battle.js';
import { generateEnemy } from './enemy.js';
import { dailyKey, dailySeed, loadDailyBest, recordDaily } from './daily.js';
import { afterWave, idleBudget, loadIdle, newIdle, saveIdle, type IdleState } from './idle.js';
import { enemyInkScale, loadRank, MAX_RANK, playerInkScale, recordClear, unlockedRank } from './rank.js';
import { loadGallery, pickRival, saveWinner } from './gallery.js';
import { applyStatic, detectLang, LANG_KEY, lang, setLang, t, type Key } from './i18n.js';
import { applyPerks, offerPerks, type Perk } from './perks.js';
import { ACHIEVEMENTS, bankIdleTokens, LocalPlatform, spendTokens, type AchievementId } from './platform.js';
import { CSS, drawDrawing, makeFrameFactory } from './render.js';
import { mulberry32 } from './rng.js';
import { applyResult, inkBudget, MAX_ROUNDS, newRun, type RunState } from './run.js';
import { decodeDrawing, encodeDrawing } from './share.js';
import { segmentParts } from './parts.js';
import { Sfx } from './sfx.js';
import { pickShareDoodle, renderSummaryCard, type RoundRecord } from './summary.js';
import type { Color, Drawing, Point, Stats, Stroke } from './types.js';
import type { ArenaRenderer, FighterView, Popup } from './view.js';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

{
  let stored: string | null = null;
  try { stored = localStorage.getItem(LANG_KEY); } catch { /* ignore */ }
  setLang(detectLang(location.search, stored, navigator.language));
  applyStatic(document);
  document.documentElement.lang = lang();
  document.title = t('title');
}
const pad = $<HTMLCanvasElement>('pad');
const arena = $<HTMLCanvasElement>('arena');
const padCtx = pad.getContext('2d')!;
/** Logical drawing size (stats, ink costs and share codes are all in these units); the canvas is 2x for crispness. */
const PAD_W = 480, PAD_H = 360, PAD_K = pad.width / PAD_W;
const preview = $<HTMLCanvasElement>('preview');
const previewCtx = preview.getContext('2d')!;
const renderer: ArenaRenderer = Arena3D.supported(arena) ? new Arena3D(arena) : new Arena2D(arena);
$('rendermode').textContent = renderer instanceof Arena3D ? '3D' : '2D';

let run: RunState = newRun();
let drawing: Drawing = { strokes: [], width: PAD_W, height: PAD_H };
let current: Stroke | null = null;
let color: Color = 'black';
let penWidth = 8;
let enemy: { name: string; drawing: Drawing; kind: 'gen' | 'rival' | 'friend' } = { ...generateEnemy(run.round, inkBudget(run.round) * enemyInkScale(run.rank), run.seed), kind: 'gen' };
const sfx = new Sfx();
const platform = new LocalPlatform(localStorage);
let history: RoundRecord[] = [];
let busy = false;
/** A doodle pasted from a share code; used as the next enemy instead of a generated one. */
let challenger: { name: string; drawing: Drawing; kind: 'friend' } | null = null;

const budget = () => Math.round(inkBudget(run.round, applyPerks(run.perks).inkBonus) * playerInkScale(run.rank));
const enemyBudget = (round: number) => Math.round(inkBudget(round) * enemyInkScale(run.rank));

// ---------- drawing pad ----------
function canvasPoint(e: PointerEvent): Point {
  const r = pad.getBoundingClientRect();
  // object-fit: contain may letterbox the canvas inside its box; map through the drawn area only.
  const boxAspect = r.width / r.height, padAspect = PAD_W / PAD_H;
  let w = r.width, h = r.height, ox = 0, oy = 0;
  if (boxAspect > padAspect) { w = r.height * padAspect; ox = (r.width - w) / 2; } else { h = r.width / padAspect; oy = (r.height - h) / 2; }
  return { x: ((e.clientX - r.left - ox) / w) * PAD_W, y: ((e.clientY - r.top - oy) / h) * PAD_H };
}

pad.addEventListener('pointerdown', (e) => {
  if (busy || remainingInk() <= 0) return;
  pad.setPointerCapture(e.pointerId);
  current = { points: [canvasPoint(e)], color, width: penFor(e) };
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

/** Pen width for this pointer: pressure-sensitive pens get 0.6x-1.4x, mice get the selected width. */
function penFor(e: PointerEvent): number {
  const pr = e.pointerType === 'pen' && e.pressure > 0 ? 0.6 + e.pressure * 0.8 : 1;
  return Math.round(penWidth * pr);
}

function remainingInk(): number {
  return budget() - totalInk(drawing);
}

function redrawPad(): void {
  padCtx.setTransform(PAD_K, 0, 0, PAD_K, 0, 0);
  padCtx.clearRect(0, 0, PAD_W, PAD_H);
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
    `<div>HP ${s.hp}</div>`, `<div>${t('stat.atk')} ${s.atk}</div>`, `<div>${t('stat.spd')} ${s.spd}/s</div>`,
    `<div>${t('stat.reach')} ${s.reach}</div>`, `<div style="color:${CSS[s.element]}">${t('stat.element')} ${jp(s.element)} (${t('stat.spikes')}${s.spikes})</div>`,
    `<div style="grid-column: 1 / -1">${traitTags(s)}</div>`,
  ].join('');
}

/** Human-readable tags for shape traits so players learn what drawing choices do. */
function traitTags(s: Stats): string {
  const tags: string[] = [];
  if (s.armor > 0) tags.push(t('trait.shield', { n: s.armor }));
  if (s.traits.eyes > 0) tags.push(t('trait.eyes', { n: s.traits.eyes, pct: Math.round(s.critBonus * 100) }));
  if (s.traits.legs > 0) tags.push(t('trait.legs', { n: s.traits.legs, v: (Math.min(4, s.traits.legs) * 0.1).toFixed(1) }));
  if (s.traits.arms > 0) tags.push(t('trait.arms', { n: s.traits.arms, v: Math.min(4, s.traits.arms) * 2 }));
  return tags.length ? tags.join(' ・ ') : t('trait.none');
}

function jp(c: Color): string {
  return t(`color.${c}` as Key);
}

// palette (vertical toolbar)
const palette = $('palette');
const colorKeys: Color[] = ['black', 'red', 'green', 'blue'];
function setColor(c: Color): void {
  color = c;
  palette.querySelectorAll<HTMLElement>('.swatch').forEach((x) => x.classList.toggle('active', x.dataset.color === c));
}
colorKeys.forEach((c, i) => {
  const b = document.createElement('div');
  b.className = 'swatch' + (c === color ? ' active' : '');
  b.dataset.color = c;
  b.style.background = CSS[c];
  b.title = `${jp(c)} [${i + 1}]`;
  b.onclick = () => setColor(c);
  palette.appendChild(b);
});
palette.appendChild(document.createElement('hr'));
const PEN_SIZES = [4, 8, 14];
function setPen(w: number): void {
  penWidth = w;
  palette.querySelectorAll<HTMLElement>('.pen').forEach((x) => x.classList.toggle('active', Number(x.dataset.w) === w));
}
PEN_SIZES.forEach((w, i) => {
  const b = document.createElement('button');
  b.className = 'pen' + (w === penWidth ? ' active' : '');
  b.dataset.w = String(w);
  b.title = `${t(w === 4 ? 'pen.thin' : w === 8 ? 'pen.mid' : 'pen.thick')} [${'QWE'[i]}]`;
  b.innerHTML = `<i style="width:${w * 1.6}px;height:${w * 1.6}px"></i>`;
  b.onclick = () => setPen(w);
  palette.appendChild(b);
});
palette.appendChild(document.createElement('hr'));
for (const [id, key, label] of [['undo', 'Z', t('draw.undo')], ['clear', 'C', t('draw.clear')]] as const) {
  const b = document.createElement('button');
  b.id = id; b.innerHTML = `${label}<br><span class="key">${key}</span>`;
  palette.appendChild(b);
}

// keyboard: 1-4 colour, Q/W/E pen, Z undo, C clear, Enter fight / next round / perk 1, Esc title
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
  if (!document.body.classList.contains('ingame') || idle) return;
  const k = e.key.toLowerCase();
  if (k >= '1' && k <= '4') setColor(colorKeys[Number(k) - 1]);
  else if (k === 'q' || k === 'w' || k === 'e') setPen(PEN_SIZES['qwe'.indexOf(k)]);
  else if (k === 'z' && !e.ctrlKey && !e.metaKey) $('undo').click();
  else if (k === 'z') $('undo').click();
  else if (k === 'c') $('clear').click();
  else if (k === 'enter') {
    const fight = $<HTMLButtonElement>('fight'), next = $<HTMLButtonElement>('next'), perk = document.querySelector<HTMLButtonElement>('#perks:not([hidden]) .perk');
    if (document.body.classList.contains('phase-draw') && !fight.disabled) fight.click();
    else if (perk) perk.click();
    else if (!next.disabled) next.click();
  }
  else if (k === 'escape') $('totitle').click();
});

/** Switch between the drawing phase (big pad, opponent preview) and the battle phase (big arena). */
function setPhase(phase: 'draw' | 'battle'): void {
  document.body.classList.toggle('phase-draw', phase === 'draw');
  document.body.classList.toggle('phase-battle', phase === 'battle');
}

/** End-of-run card: every doodle you used, win/lose per round, save or copy as PNG. */
function showSummary(): void {
  const card = renderSummaryCard(run, history, $<HTMLCanvasElement>('summarycard'));
  $('summary').hidden = false;
  $('savecard').onclick = () => {
    const a = document.createElement('a');
    a.download = `rakugaki-brawl-${run.seed}.png`;
    a.href = card.toDataURL('image/png');
    a.click();
  };
  const best = pickShareDoodle(history);
  const linkBtn = $<HTMLButtonElement>('sharelink');
  linkBtn.hidden = !best;
  linkBtn.onclick = async () => {
    if (!best) return;
    // A link that opens the game with this doodle as the challenger.
    const url = `${location.origin}${location.pathname}?code=${encodeDrawing(best.drawing)}`;
    try { await navigator.clipboard.writeText(url); $('cardmsg').textContent = t('summary.linkCopied', { n: url.length }); }
    catch { $<HTMLInputElement>('pastecode').value = url; $('cardmsg').textContent = t('summary.linkFallback'); }
  };
  $('copycard').onclick = async () => {
    try {
      const blob = await new Promise<Blob | null>((res) => card.toBlob(res, 'image/png'));
      if (!blob) throw new Error('no blob');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      $('cardmsg').textContent = t('summary.copied');
    } catch {
      $('cardmsg').textContent = t('summary.copyFail');
    }
  };
}

/** A fresh run that carries banked idle-mode ink tokens as 'ink' perks. */
function startRunWithTokens(rank: number, daily: string | undefined): RunState {
  const n = spendTokens(localStorage);
  const r = daily ? newRun(dailySeed(daily), rank, daily) : newRun(undefined, rank);
  if (n > 0) r.perks = Array.from({ length: n }, () => 'ink' as const);
  return r;
}

// ---------- idle (second-monitor) mode ----------
let idle: IdleState | null = null;
let idleTimer = 0;

/** Enter idle mode: wide strip, your doodle (or a past winner) fights endless waves. */
function enterIdle(): void {
  if (busy || idle) return;
  if (drawing.strokes.length === 0) {
    const g = loadGallery(localStorage);
    const pick = g.length ? pickRival(g, 99, mulberry32(Date.now() % 100000)) ?? pickRival(g, g[g.length - 1].round, mulberry32(1)) : null;
    if (!pick) { log(t('idle.needDrawing')); return; }
    drawing = pick.drawing;
  }
  idle = loadIdle(localStorage) ?? newIdle();
  document.body.classList.add('idle');
  arena.width = 1920; arena.height = 440;
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
  arena.width = 1280; arena.height = 800;
  renderer.resize();
  busy = false;
  startRound(false, true);
}

function idleWave(): void {
  if (!idle) return;
  const st = idle;
  const a = makeFighter(t('idle.you'), structuredClone(drawing), 60, applyPerks(run.perks));
  const foe = generateEnemy(Math.min(10, 1 + Math.floor((st.wave - 1) / 2)), idleBudget(st.wave), st.seed + st.wave * 101);
  const b = makeFighter(`${foe.name} (wave ${st.wave})`, foe.drawing, ARENA_W - 60);
  const result = simulate(a, b, st.seed + st.wave);
  sfx.enabled = false;
  busy = true;
  $('idlestats').textContent = t('idle.stats', { wave: st.wave, wins: st.wins, streak: st.streak, best: st.bestStreak });
  replay(a, b, result.events, () => {
    busy = false;
    banner(null);
    if (!idle) return;
    const prevWins = idle.wins;
    idle = afterWave(idle, result.winner);
    saveIdle(localStorage, idle);
    const tokens = bankIdleTokens(localStorage, prevWins, idle.wins);
    if (idle.streak >= 5) achieve('idle_streak_5');
    $('idletokens').textContent = tokens ? t('idle.tokens', { n: tokens }) : '';
    $('idlestats').textContent = t('idle.stats', { wave: idle.wave, wins: idle.wins, streak: idle.streak, best: idle.bestStreak });
    idleTimer = window.setTimeout(idleWave, 1200);
  });
}

// ---------- volume ----------
{
  const slider = $<HTMLInputElement>('volume');
  slider.value = String(Math.round(sfx.volume * 100));
  const label = () => { $('volumelabel').textContent = sfx.volume === 0 ? t('volume.mute') : `${Math.round(sfx.volume * 100)}%`; };
  slider.oninput = () => { sfx.setVolume(Number(slider.value) / 100); label(); };
  label();
}

// ---------- title screen ----------
function refreshTitle(): void {
  const sel = $<HTMLSelectElement>('rank');
  const unlocked = unlockedRank(loadRank(localStorage));
  sel.innerHTML = '';
  for (let r = 0; r <= unlocked; r++) { const o = document.createElement('option'); o.value = String(r); o.textContent = String(r); sel.appendChild(o); }
  sel.value = String(Math.min(unlocked, Number(sel.dataset.pick ?? unlocked)));
  const hint = () => {
    const r = Number(sel.value);
    $('rankhint').textContent = t('title.rankHint', { r, p: Math.round(playerInkScale(r) * 100), e: Math.round(enemyInkScale(r) * 100) }) + (unlocked < MAX_RANK && r === unlocked ? ' ' + t('title.rankLocked', { r }) : '');
  };
  sel.onchange = () => { sel.dataset.pick = sel.value; hint(); };
  hint();
  const best = loadDailyBest(localStorage, dailyKey());
  $('dailybest').textContent = best ? t('title.dailyBest', { wins: best.wins, rounds: best.rounds }) : t('title.dailyNone');
  const have = platform.unlocked();
  const ids = Object.keys(ACHIEVEMENTS) as AchievementId[];
  $('achcount').textContent = t('title.achCount', { n: have.length, total: ids.length });
  refreshGallery();
  $('achlist').innerHTML = ids.map((id) => `<div class="ach ${have.includes(id) ? '' : 'locked'}"><span class="dot"></span><div><strong>${t(`ach.${id}.name` as Key)}</strong><div class="hint">${t(`ach.${id}.desc` as Key)}</div></div></div>`).join('');
}

/** Title-screen bestiary: every doodle that won a round, with its stats, reusable as a starter. */
function refreshGallery(): void {
  const entries = loadGallery(localStorage).slice().reverse();
  const box = $('gallery');
  box.innerHTML = '';
  $('galcount').textContent = t('title.galCount', { n: entries.length });
  if (entries.length === 0) { const e = document.createElement('div'); e.className = 'empty'; e.textContent = t('title.galEmpty'); box.appendChild(e); return; }
  for (const entry of entries) {
    let d: Drawing;
    try { d = decodeDrawing(entry.code); } catch { continue; }
    const st = analyze(d);
    const card = document.createElement('div'); card.className = 'gal';
    const c = document.createElement('canvas'); c.width = 240; c.height = 150;
    const g = c.getContext('2d')!; g.scale(240 / d.width, 150 / d.height); drawDrawing(g, d);
    const info = document.createElement('div');
    info.innerHTML = `<strong>${t('gal.round', { round: entry.round })}</strong><br>HP ${st.hp} · ATK ${st.atk} · SPD ${st.spd.toFixed(2)}`;
    const use = document.createElement('button'); use.textContent = t('gal.use');
    use.onclick = () => { drawing = { ...d, strokes: d.strokes.map((s) => ({ ...s, points: s.points.slice() })) }; beginRun(Number($<HTMLSelectElement>('rank').value), undefined, true); };
    card.append(c, info, use);
    box.appendChild(card);
  }
}

function beginRun(rank: number, daily?: string, keepDrawing = false): void {
  history = [];
  $('summary').hidden = true;
  run = startRunWithTokens(rank, daily);
  document.body.classList.add('ingame');
  document.body.classList.toggle('daily', !!daily);
  startRound(true, keepDrawing);
  if (run.perks.length) log(t('idle.carry', { n: run.perks.length }));
}

function toTitle(): void {
  if (idle) exitIdle();
  document.body.classList.remove('ingame', 'daily', 'boss');
  refreshTitle();
}

$('start').onclick = () => beginRun(Number($<HTMLSelectElement>('rank').value));
$('startdaily').onclick = () => beginRun(0, dailyKey());
$('titleidle').onclick = () => { document.body.classList.add('ingame'); enterIdle(); if (!idle) toTitle(); };
$('showach').onclick = () => { $('gallery').classList.remove('open'); if ($('achlist').classList.toggle('open')) $('achlist').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
$('showgallery').onclick = () => { $('achlist').classList.remove('open'); if ($('gallery').classList.toggle('open')) $('gallery').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
$('totitle').onclick = toTitle;
$('totitle2').onclick = toTitle;
$('idle2').onclick = () => $('idle').click();
$('langtoggle2').onclick = () => $('langtoggle').click();

$('langtoggle').onclick = () => { setLang(lang() === 'ja' ? 'en' : 'ja', localStorage); const u = new URL(location.href); u.searchParams.delete('lang'); location.href = u.toString(); };

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
$('restart').onclick = () => beginRun(run.rank, run.dailyKey);
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
  setPhase('battle');
  const a = makeFighter(t('you'), structuredClone(drawing), 60, applyPerks(run.perks));
  const b = makeFighter(enemy.name, structuredClone(enemy.drawing), ARENA_W - 60);
  const result = simulate(a, b, run.seed + run.round);
  log(t('round.log', { round: run.round, a: a.name, ahp: a.stats.hp, aatk: a.stats.atk, b: b.name, bhp: b.stats.hp, batk: b.stats.atk }));
  replay(a, b, result.events, () => {
    const wonRound = run.round;
    history.push({ round: run.round, drawing: structuredClone(a.drawing), enemyName: enemy.name, result: result.winner === 'a' ? 'win' : result.winner === 'b' ? 'lose' : 'draw' });
    run = applyResult(run, result.winner);
    log(t(result.winner === 'a' ? 'win' : result.winner === 'b' ? 'lose' : 'draw'));
    banner(null);
    if (result.winner === 'a') {
      saveWinner(localStorage, a.drawing, wonRound);
      achieve('first_win');
      const t = a.stats.traits;
      if (a.stats.armor > 0 && t.eyes > 0 && t.legs > 0 && t.arms > 0) achieve('full_creature');
      if (enemy.kind === 'rival') achieve('beat_rival');
      if (run.over && run.lives > 0) achieve('clear_run');
    }
    if (enemy.kind === 'friend') achieve('share_fight');
    busy = false;
    updateStatus();
    if (run.over) {
      log(run.lives <= 0 ? t('gameover', { wins: run.wins }) : t('cleared', { wins: run.wins, max: MAX_ROUNDS }));
      $<HTMLButtonElement>('next').disabled = true;
      if (run.lives > 0) {
        const before = unlockedRank(loadRank(localStorage));
        const after = unlockedRank(recordClear(localStorage, run.rank));
        if (after > before) log(t('rank.cleared', { r: run.rank, next: after }));
      }
      if (run.dailyKey) {
        const best = recordDaily(localStorage, { key: run.dailyKey, wins: run.wins, rounds: history.length, cleared: run.lives > 0 });
        log(t('daily.recorded', { wins: best.wins, rounds: best.rounds }));
      }
      showSummary();
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
    const tm = (now - start) / 1000 - frozen;
    // Wind-up whoosh slightly before each hit lands.
    while (nextSwing < events.length && events[nextSwing].t - swingLead <= tm) {
      if (events[nextSwing].kind === 'hit') sfx.swing();
      nextSwing++;
    }
    while (!finished && i < events.length && events[i].t <= tm) {
      const ev = events[i++];
      if (ev.kind === 'hit') {
        const big = ev.crit || ev.mult > 1;
        sfx.hit(big);
        shake = big ? 8 : 3;
        flash = ev.from === 'a' ? 'b' : 'a';
        flashLife = 0.12;
        if (big) pauseUntil = now + 90;
        const text = (ev.crit ? '!! ' : '') + ev.dmg + (ev.mult > 1 ? t('hit.super') : ev.mult < 1 ? t('hit.weak') : '');
        if (ev.from === 'a') { hpB -= ev.dmg; popups.push({ x: xB, text, color: CSS[a.stats.element], life: 1 }); }
        else { hpA -= ev.dmg; popups.push({ x: xA, text, color: CSS[b.stats.element], life: 1 }); }
      } else {
        finished = true;
        endAt = tm + 2.2; // KO topple, then the winner's victory hops
        if (ev.winner === 'a') { sfx.win(); banner(t('win'), CSS[a.stats.element]); }
        else if (ev.winner === 'b') { sfx.lose(); banner(t('lose'), '#8a8378'); }
        else banner(t('draw'), '#8a8378');
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
    for (const p of popups) p.life -= dt * 1.4;
    while (popups.length && (popups[0].life <= 0 || popups.length > 6)) popups.shift();
    const phaseA = phaseAt(events, 'a', tm, movedA), phaseB = phaseAt(events, 'b', tm, movedB);
    renderer.draw({
      t: tm, xA, xB,
      poseA: poseOf(phaseA), poseB: poseOf(phaseB), phaseA, phaseB,
      hpA, hpB, hpA0, hpB0, popups, shake,
      flashA: flash === 'a' && flashLife > 0,
      flashB: flash === 'b' && flashLife > 0,
    });
    shake = Math.max(0, shake - 0.6);
    hud(a.name, b.name, CSS[a.stats.element], CSS[b.stats.element], hpA / hpA0, hpB / hpB0);
    if (tm >= endAt) { done(); return; }
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

/** Unlock an achievement and toast it the first time. */
function achieve(id: AchievementId): void {
  if (!platform.unlock(id)) return;
  void ACHIEVEMENTS;
  const name = t(`ach.${id}.name` as Key), desc = t(`ach.${id}.desc` as Key);
  log(t('ach.unlocked', { name, desc }));
  const el = $('toast');
  el.textContent = t('ach.toast', { name });
  el.hidden = false;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  window.setTimeout(() => { el.hidden = true; }, 2600);
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
    b.innerHTML = `<strong>${t(`perk.${perk.id}.name` as Key)}</strong><small>${t(`perk.${perk.id}.desc` as Key)}</small>`;
    b.onclick = () => {
      run = { ...run, perks: [...run.perks, perk.id] };
      log(t('perk.picked', { name: t(`perk.${perk.id}.name` as Key) }));
      box.hidden = true;
      startRound(false);
    };
    box.appendChild(b);
  }
}

// ---------- share codes ----------
$('copycode').onclick = async () => {
  if (drawing.strokes.length === 0) { $('copied').textContent = t('share.drawFirst'); return; }
  const code = encodeDrawing(drawing);
  try { await navigator.clipboard.writeText(code); $('copied').textContent = t('share.copied', { n: code.length }); }
  catch { $<HTMLInputElement>('pastecode').value = code; $('copied').textContent = t('share.fallback'); }
};
$('usecode').onclick = () => {
  const code = $<HTMLInputElement>('pastecode').value;
  try {
    const d = decodeDrawing(code);
    if (d.strokes.length === 0) throw new Error('empty drawing');
    challenger = { name: t('friend'), drawing: d, kind: 'friend' };
    log(t('share.next'));
    if (!busy) startRound(false, true);
  } catch (e) {
    log(t('share.bad', { msg: (e as Error).message }));
  }
};

function startRound(fresh: boolean, keepDrawing = false): void {
  if (fresh) $('log').textContent = '';
  if (!keepDrawing) drawing = { strokes: [], width: PAD_W, height: PAD_H };
  $('perks').hidden = true;
  if (challenger) { enemy = challenger; challenger = null; }
  else {
    // Every third round from round 2 on, a past winner of yours comes back as a rival.
    const rival = run.round >= 2 && run.round % 3 === 2
      ? pickRival(loadGallery(localStorage), run.round, mulberry32(run.seed * 17 + run.round))
      : null;
    enemy = rival
      ? { name: t('rival', { round: rival.entry.round }), drawing: rival.drawing, kind: 'rival' }
      : { ...generateEnemy(run.round, enemyBudget(run.round), run.seed), kind: 'gen' };
  }
  $<HTMLButtonElement>('next').disabled = true;
  const b = makeFighter(enemy.name, enemy.drawing, ARENA_W - 60);
  renderStats($('enemystats'), b.stats);
  renderer.preview(viewOf(b), ARENA_W - 60);
  drawPreview(b);
  hud('', t('nextEnemy', { name: enemy.name }), '#222', CSS[b.stats.element], 0, 1);
  updateStatus();
  if (!idle) setPhase('draw');
  redrawPad();
}

/** Opponent card on the drawing screen: name, the doodle itself, element colour. */
function drawPreview(b: Fighter): void {
  const c = previewCtx;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, preview.width, preview.height);
  c.fillStyle = '#f1ede2'; c.fillRect(0, 230, preview.width, 70);
  const d = b.drawing;
  const k = Math.min((preview.width - 40) / d.width, 200 / d.height);
  c.save(); c.translate((preview.width - d.width * k) / 2, 230 - d.height * k); c.scale(k, k); drawDrawing(c, d); c.restore();
  c.fillStyle = CSS[b.stats.element]; c.font = 'bold 20px system-ui'; c.textAlign = 'center';
  c.fillText(b.name, preview.width / 2, 268);
}

function updateStatus(): void {
  const perks = run.perks.length ? t('status.perks', { n: run.perks.length }) : '';
  $('status').textContent = t('status', { round: Math.min(run.round, MAX_ROUNDS), max: MAX_ROUNDS, lives: '♥'.repeat(run.lives), wins: run.wins }) + perks;
  $('badges').innerHTML = (run.rank ? `<span class="badge">${t('badge.rank', { r: run.rank })}</span>` : '') + (run.dailyKey ? `<span class="badge">${t('badge.daily', { date: run.dailyKey.slice(5) })}</span>` : '');
  // Boss rounds (10) tint the paper red, like a state change.
  document.body.classList.toggle('boss', run.round >= MAX_ROUNDS && !run.over);
  $('roundinfo').textContent = `seed ${run.seed}`;
}

startRound(true);
refreshTitle();
{
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  if (code) {
    try {
      const d = decodeDrawing(code);
      if (d.strokes.length) { challenger = { name: t('friend'), drawing: d, kind: 'friend' }; document.body.classList.add('ingame'); log(t('share.linkNext')); startRound(false, true); }
    } catch { log(t('share.linkBad')); }
  }
  if (params.has('idle')) { document.body.classList.add('ingame'); enterIdle(); }
}

// Debug surface for automated tests: inspect the current doodle's segmentation.
(window as unknown as { __rakugaki: unknown }).__rakugaki = {
  parts: () => segmentParts(drawing),
  drawing: () => drawing,
  frame: (t: number, kind: 'walk' | 'idle' | 'attack' | 'hit' | 'ko' | 'win', u: number) => makeFrameFactory(drawing, analyze(drawing).bbox).frame(t, { kind, u, big: false }).toDataURL(),
};
