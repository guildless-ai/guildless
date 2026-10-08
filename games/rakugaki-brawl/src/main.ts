import { analyze, totalInk } from './analyze.js';
import { ARENA_W, makeFighter, simulate, type BattleEvent, type Fighter } from './battle.js';
import { generateEnemy } from './enemy.js';
import { applyPerks, offerPerks, type Perk } from './perks.js';
import { CSS, drawDrawing, toSprite } from './render.js';
import { mulberry32 } from './rng.js';
import { decodeDrawing, encodeDrawing } from './share.js';
import { applyResult, inkBudget, MAX_ROUNDS, newRun, type RunState } from './run.js';
import type { Color, Drawing, Point, Stats, Stroke } from './types.js';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const pad = $<HTMLCanvasElement>('pad');
const arena = $<HTMLCanvasElement>('arena');
const padCtx = pad.getContext('2d')!;
const arenaCtx = arena.getContext('2d')!;

let run: RunState = newRun();
let drawing: Drawing = { strokes: [], width: pad.width, height: pad.height };
let current: Stroke | null = null;
let color: Color = 'black';
let penWidth = 8;
let enemy = generateEnemy(run.round, inkBudget(run.round), run.seed);
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
  ].join('');
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

$('undo').onclick = () => { drawing.strokes.pop(); redrawPad(); };
$('clear').onclick = () => { drawing.strokes = []; redrawPad(); };
$('restart').onclick = () => { run = newRun(); startRound(true); };
$('next').onclick = () => startRound(false);

// ---------- battle ----------
$('fight').onclick = () => {
  if (busy || drawing.strokes.length === 0) return;
  busy = true;
  $<HTMLButtonElement>('fight').disabled = true;
  const a = makeFighter('あなた', structuredClone(drawing), 60, applyPerks(run.perks));
  const b = makeFighter(enemy.name, structuredClone(enemy.drawing), ARENA_W - 60);
  const result = simulate(a, b, run.seed + run.round);
  log(`ラウンド ${run.round}: ${a.name} (${a.stats.hp}HP/${a.stats.atk}ATK) vs ${b.name} (${b.stats.hp}HP/${b.stats.atk}ATK)`);
  replay(a, b, result.events, () => {
    run = applyResult(run, result.winner);
    log(result.winner === 'a' ? '勝ち！' : result.winner === 'b' ? '負け…' : '相打ち');
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

/** Replay the event log visually: fighters walk, bounce on hit, HP bars drain. */
function replay(a: Fighter, b: Fighter, events: BattleEvent[], done: () => void): void {
  const spriteA = toSprite(a.drawing, a.stats.bbox);
  const spriteB = toSprite(b.drawing, b.stats.bbox);
  const hpA0 = a.stats.hp, hpB0 = b.stats.hp;
  let hpA = hpA0, hpB = hpB0;
  let xA = 60, xB = ARENA_W - 60;
  let i = 0;
  const start = performance.now();
  const bumps: { x: number; y: number; text: string; color: string; life: number }[] = [];
  const speed = 1; // 1x realtime
  const frame = (now: number) => {
    const t = ((now - start) / 1000) * speed;
    // advance events
    while (i < events.length && events[i].t <= t) {
      const ev = events[i++];
      if (ev.kind === 'hit') {
        if (ev.from === 'a') { hpB -= ev.dmg; bumps.push({ x: xB, y: 110, text: (ev.crit ? '!! ' : '') + ev.dmg + (ev.mult > 1 ? ' 効果大' : ev.mult < 1 ? ' いまいち' : ''), color: CSS[a.stats.element], life: 1 }); }
        else { hpA -= ev.dmg; bumps.push({ x: xA, y: 110, text: (ev.crit ? '!! ' : '') + ev.dmg + (ev.mult > 1 ? ' 効果大' : ev.mult < 1 ? ' いまいち' : ''), color: CSS[b.stats.element], life: 1 }); }
      } else {
        drawArena();
        setTimeout(done, 400);
        return;
      }
    }
    // walk until within reach (mirrors simulation)
    const gap = xB - xA;
    const dt = 1 / 60;
    if (gap > a.stats.reach && gap > b.stats.reach) { xA += 90 * dt; xB -= 90 * dt; }
    else { if (gap > a.stats.reach) xA += 90 * dt; if (gap > b.stats.reach) xB -= 90 * dt; }
    drawArena(t);
    requestAnimationFrame(frame);
  };

  function drawArena(t = 0): void {
    arenaCtx.clearRect(0, 0, arena.width, arena.height);
    arenaCtx.fillStyle = '#f1ede2';
    arenaCtx.fillRect(0, 220, arena.width, 80);
    const wobble = Math.sin(t * 12) * 3;
    blit(spriteA, xA, 220 + wobble, 1);
    blit(spriteB, xB, 220 - wobble, -1);
    bar(20, 16, hpA / hpA0, CSS[a.stats.element], a.name);
    bar(ARENA_W - 180, 16, hpB / hpB0, CSS[b.stats.element], b.name);
    for (const bmp of bumps) {
      bmp.life -= 1 / 60; bmp.y -= 0.8;
      if (bmp.life <= 0) continue;
      arenaCtx.globalAlpha = Math.max(0, bmp.life);
      arenaCtx.fillStyle = bmp.color; arenaCtx.font = 'bold 16px system-ui';
      arenaCtx.textAlign = 'center'; arenaCtx.fillText(bmp.text, bmp.x, bmp.y);
      arenaCtx.globalAlpha = 1;
    }
  }
  function blit(sprite: HTMLCanvasElement, x: number, groundY: number, dir: 1 | -1): void {
    const maxH = 140, maxW = 200;
    const scale = Math.min(1, maxH / sprite.height, maxW / sprite.width);
    const w = sprite.width * scale, h = sprite.height * scale;
    arenaCtx.save();
    arenaCtx.translate(x, groundY);
    arenaCtx.scale(dir, 1);
    arenaCtx.drawImage(sprite, -w / 2, -h, w, h);
    arenaCtx.restore();
  }
  function bar(x: number, y: number, ratio: number, col: string, label: string): void {
    arenaCtx.fillStyle = '#ddd'; arenaCtx.fillRect(x, y, 160, 12);
    arenaCtx.fillStyle = col; arenaCtx.fillRect(x, y, 160 * Math.max(0, ratio), 12);
    arenaCtx.strokeStyle = '#222'; arenaCtx.strokeRect(x, y, 160, 12);
    arenaCtx.fillStyle = '#222'; arenaCtx.font = '12px system-ui'; arenaCtx.textAlign = 'left';
    arenaCtx.fillText(label, x, y + 26);
  }
  requestAnimationFrame(frame);
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
  else enemy = generateEnemy(run.round, inkBudget(run.round), run.seed);
  $<HTMLButtonElement>('next').disabled = true;
  // preview enemy in arena
  const es = analyze(enemy.drawing);
  renderStats($('enemystats'), es);
  arenaCtx.clearRect(0, 0, arena.width, arena.height);
  const sprite = toSprite(enemy.drawing, es.bbox);
  const scale = Math.min(1, 140 / sprite.height, 200 / sprite.width);
  arenaCtx.drawImage(sprite, ARENA_W - 60 - (sprite.width * scale) / 2, 220 - sprite.height * scale, sprite.width * scale, sprite.height * scale);
  arenaCtx.fillStyle = '#222'; arenaCtx.font = '14px system-ui'; arenaCtx.textAlign = 'center';
  arenaCtx.fillText(`次の相手: ${enemy.name}`, ARENA_W - 60, 250);
  updateStatus();
  redrawPad();
}

function updateStatus(): void {
  const perks = run.perks.length ? ` ・ 強化 ${run.perks.length}` : '';
  $('status').textContent = `ラウンド ${Math.min(run.round, MAX_ROUNDS)}/${MAX_ROUNDS} ・ 残機 ${'♥'.repeat(run.lives)} ・ ${run.wins} 勝${perks}`;
  $('roundinfo').textContent = `seed ${run.seed}`;
}

startRound(true);
