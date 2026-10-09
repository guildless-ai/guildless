import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectLang, lang, setLang, t } from '../src/i18n.js';

test('every key renders in both languages with parameters filled', () => {
  setLang('ja');
  assert.equal(t('idle.stats', { wave: 3, wins: 2, streak: 1, best: 4 }), 'wave 3 ・ 2 勝 ・ 連勝 1（最高 4）');
  setLang('en');
  assert.equal(t('idle.stats', { wave: 3, wins: 2, streak: 1, best: 4 }), 'wave 3 · 2 wins · streak 1 (best 4)');
  assert.equal(t('rival', { round: 7 }), 'Past self (R7)');
  assert.equal(lang(), 'en');
  // unknown placeholders are left visible rather than dropped
  assert.equal(t('status.perks', {}), ' · perks {n}');
  setLang('ja');
});

test('language detection order: query, storage, browser', () => {
  assert.equal(detectLang('?lang=en', 'ja', 'ja-JP'), 'en');
  assert.equal(detectLang('', 'en', 'ja-JP'), 'en');
  assert.equal(detectLang('', null, 'ja-JP'), 'ja');
  assert.equal(detectLang('', null, 'en-US'), 'en');
  assert.equal(detectLang('?lang=xx', 'zz', 'fr'), 'en');
});
