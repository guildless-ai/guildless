import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACHIEVEMENTS, bankIdleTokens, LocalPlatform, loadTokens, spendTokens, TOKEN_CAP, tokensFromWins } from '../src/platform.js';

const mem = () => { const s: Record<string, string> = {}; return { getItem: (k: string) => s[k] ?? null, setItem: (k: string, v: string) => { s[k] = v; }, s }; };

test('achievements unlock once and persist', () => {
  const kv = mem();
  const p = new LocalPlatform(kv);
  assert.equal(p.unlock('first_win'), true);
  assert.equal(p.unlock('first_win'), false);
  assert.deepEqual(new LocalPlatform(kv).unlocked(), ['first_win']);
  kv.s['rakugaki-brawl.achievements.v1'] = '["bogus", "clear_run", 3]';
  assert.deepEqual(new LocalPlatform(kv).unlocked(), ['clear_run']);
  assert.equal(Object.keys(ACHIEVEMENTS).length, 6);
});

test('idle tokens: one per 5 wins, capped, spent on a new run', () => {
  const kv = mem();
  assert.equal(tokensFromWins(4), 0);
  assert.equal(tokensFromWins(5), 1);
  assert.equal(bankIdleTokens(kv, 4, 5), 1);
  assert.equal(bankIdleTokens(kv, 5, 6), 1);
  assert.equal(bankIdleTokens(kv, 6, 25), TOKEN_CAP);
  assert.equal(loadTokens(kv), TOKEN_CAP);
  assert.equal(spendTokens(kv), TOKEN_CAP);
  assert.equal(loadTokens(kv), 0);
  kv.s['rakugaki-brawl.inktokens.v1'] = 'junk';
  assert.equal(loadTokens(kv), 0);
});
