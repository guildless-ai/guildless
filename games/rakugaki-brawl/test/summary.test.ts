import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newRun } from '../src/run.js';
import { CARD_H, CARD_W, cardLayout, cardTitle, type RoundRecord } from '../src/summary.js';

const rec = (round: number, result: RoundRecord['result']): RoundRecord => ({ round, result, enemyName: 'x', drawing: { width: 480, height: 360, strokes: [] } });

test('card layout: one row up to 5, two rows up to 10, inside the card', () => {
  for (const n of [1, 3, 5, 6, 10]) {
    const L = cardLayout(n);
    assert.equal(L.rows, n <= 5 ? 1 : 2);
    assert.equal(L.cols, n <= 5 ? n : 5);
    assert.ok(L.originX >= 0 && L.originX + L.cols * L.cell <= CARD_W);
    assert.ok(L.originY >= 150 && L.originY + L.rows * L.cell <= CARD_H);
  }
  assert.equal(cardLayout(0).cols, 1);
  assert.equal(cardLayout(25).rows, 2);
});

test('card title distinguishes a full clear from a game over', () => {
  const r = newRun(1);
  const full = Array.from({ length: 10 }, (_, i) => rec(i + 1, 'win'));
  assert.equal(cardTitle(r, full), '完走！ 10勝');
  const dead = { ...r, lives: 0 };
  assert.equal(cardTitle(dead, [rec(1, 'win'), rec(2, 'lose'), rec(3, 'lose'), rec(4, 'lose')]), '4ラウンド 1勝で力尽きた');
});
