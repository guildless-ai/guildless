/**
 * Tiny i18n: two dictionaries, a current language persisted in storage and
 * selectable with ?lang=. Static page text uses data-i18n attributes; code
 * calls t(). Keys missing from a language fall back to Japanese, then to the
 * key itself, so a typo never renders blank.
 */
export type Lang = 'ja' | 'en';
const LANG_KEY = 'rakugaki-brawl.lang.v1';

const ja = {
  title: 'らくがきブロウル',
  'draw.heading': '描く', 'draw.hint': 'インクは有限。何を描く？', 'draw.ink': 'インク',
  'draw.undo': '戻す', 'draw.clear': '消す', 'draw.fight': 'たたかう！',
  'draw.rules': '太く塗る→HP / トゲ・角→攻撃 / 軽い→素早さ / 横に長い→リーチ / 閉じた輪→盾 / 目→クリティカル / 脚→速さ / 腕→攻撃。色は相性: 赤>緑>青>赤、黒は無属性。',
  'pen.thin': '細', 'pen.mid': '中', 'pen.thick': '太',
  'battle.heading': 'バトル', 'battle.next': '次のラウンド', 'battle.restart': '最初から',
  'idle.button': '放置モード', 'idle.buttonTitle': '画面端に置いて作業しながら眺める',
  'idle.window': '放置ウィンドウ', 'idle.windowTitle': '常に最前面の細長ウィンドウで放置モードを開く',
  'idle.exit': '描くに戻る', 'idle.needDrawing': '放置モードには絵が要る。何か描くか一勝してから',
  'idle.stats': 'wave {wave} ・ {wins} 勝 ・ 連勝 {streak}（最高 {best}）',
  'idle.tokens': 'インク壺 ×{n}（次のランで使う）', 'idle.carry': '放置モードの報酬: インク壺 ×{n} を持ち込み',
  'idle.you': 'あなたの絵',
  'volume': '音量', 'volume.mute': 'ミュート',
  'summary.heading': '今回のラン', 'summary.hint': '使った絵と戦績。SNS 用の 1200×630 画像',
  'summary.save': '画像を保存', 'summary.copy': '画像をコピー', 'summary.link': '対戦リンクをコピー',
  'summary.linkTitle': 'この絵と対戦できるリンク。画像と一緒に投稿する',
  'summary.copied': '画像をコピーした', 'summary.copyFail': 'コピーできない環境。保存を使って',
  'summary.linkCopied': '対戦リンクをコピーした ({n}文字)', 'summary.linkFallback': 'リンクを下の欄に出した',
  'summary.clear': '完走！ {wins}勝', 'summary.dead': '{rounds}ラウンド {wins}勝で力尽きた',
  'summary.sub': 'らくがきブロウル ・ 強化 {perks} ・ seed {seed}', 'summary.tag': '#らくがきブロウル',
  'share.summary': '友だちと対戦（共有コード）', 'share.copy': '今の絵のコードをコピー', 'share.paste': '相手のコードを貼る',
  'share.use': 'この絵と対戦', 'share.hint': 'コードは絵そのもの。サーバ不要で、相手の落書きが次のラウンドの敵になる。',
  'share.drawFirst': 'まず何か描いて', 'share.copied': 'コピーした ({n}文字)', 'share.fallback': '下の欄に出した',
  'share.next': '次のラウンドは共有コードの絵と対戦', 'share.bad': 'コードを読めない: {msg}',
  'share.linkNext': 'リンクの絵が次の相手', 'share.linkBad': 'リンクのコードを読めない',
  'stat.atk': '攻撃', 'stat.spd': '速さ', 'stat.reach': 'リーチ', 'stat.element': '属性', 'stat.spikes': 'トゲ',
  'color.black': '黒', 'color.red': '赤', 'color.green': '緑', 'color.blue': '青',
  'trait.shield': '盾{n}（輪 → 被ダメ -{n}）', 'trait.eyes': '目{n}（クリ +{pct}%）', 'trait.legs': '脚{n}（速さ +{v}）',
  'trait.arms': '腕{n}（攻撃 +{v}）', 'trait.none': '形の特性なし（輪・目・脚・腕を描くと付く）',
  'you': 'あなた', 'rival': 'むかしの自分 (R{round})', 'friend': 'ともだちの絵', 'nextEnemy': '次の相手: {name}',
  'round.log': 'ラウンド {round}: {a} ({ahp}HP/{aatk}ATK) vs {b} ({bhp}HP/{batk}ATK)',
  'win': '勝ち！', 'lose': '負け…', 'draw': '相打ち', 'hit.super': ' 効果大', 'hit.weak': ' いまいち',
  'gameover': 'ゲームオーバー。{wins} 勝', 'cleared': '完走！ {wins} 勝 / {max} 戦',
  'status': 'ラウンド {round}/{max} ・ 残機 {lives} ・ {wins} 勝', 'status.perks': ' ・ 強化 {n}',
  'ach.unlocked': '実績解除: {name} ― {desc}', 'ach.toast': '実績解除　{name}', 'perk.picked': 'アップグレード: {name}',
  'perk.ink.name': 'インク壺', 'perk.ink.desc': 'インク上限 +900', 'perk.atk.name': 'とがった鉛筆', 'perk.atk.desc': '攻撃 +20%',
  'perk.hp.name': '厚紙', 'perk.hp.desc': 'HP +20%', 'perk.spd.name': '速描き', 'perk.spd.desc': '速さ +15%',
  'perk.crit.name': '一発芸', 'perk.crit.desc': 'クリティカル率 +10%', 'perk.reach.name': '長い腕', 'perk.reach.desc': 'リーチ +15',
  'ach.first_win.name': 'はじめての勝利', 'ach.first_win.desc': 'ラウンドに勝つ',
  'ach.clear_run.name': '完走', 'ach.clear_run.desc': '10ラウンドを走り切る',
  'ach.full_creature.name': 'フル装備', 'ach.full_creature.desc': '盾・目・脚・腕のそろった絵で戦う',
  'ach.beat_rival.name': '過去を超える', 'ach.beat_rival.desc': '「むかしの自分」に勝つ',
  'ach.share_fight.name': 'ともだちと', 'ach.share_fight.desc': '共有コードの絵と戦う',
  'ach.idle_streak_5.name': '放置の達人', 'ach.idle_streak_5.desc': '放置モードで5連勝',
  'lang.toggle': 'English',
};
export type Key = keyof typeof ja;

const en: Record<Key, string> = {
  title: 'Rakugaki Brawl',
  'draw.heading': 'Draw', 'draw.hint': 'Ink is limited. What will you draw?', 'draw.ink': 'Ink',
  'draw.undo': 'Undo', 'draw.clear': 'Clear', 'draw.fight': 'Fight!',
  'draw.rules': 'Thick = HP / spikes & corners = attack / light = speed / wide = reach / closed loop = shield / eyes = crit / legs = speed / arms = attack. Colours: red > green > blue > red, black is neutral.',
  'pen.thin': 'Thin', 'pen.mid': 'Mid', 'pen.thick': 'Thick',
  'battle.heading': 'Battle', 'battle.next': 'Next round', 'battle.restart': 'New run',
  'idle.button': 'Idle mode', 'idle.buttonTitle': 'Park it at the edge of your screen while you work',
  'idle.window': 'Idle window', 'idle.windowTitle': 'Open idle mode in an always-on-top strip window',
  'idle.exit': 'Back to drawing', 'idle.needDrawing': 'Idle mode needs a doodle. Draw something or win a round first',
  'idle.stats': 'wave {wave} · {wins} wins · streak {streak} (best {best})',
  'idle.tokens': 'Ink pot ×{n} (used on your next run)', 'idle.carry': 'Idle reward: carrying ink pot ×{n} into this run',
  'idle.you': 'Your doodle',
  'volume': 'Volume', 'volume.mute': 'Muted',
  'summary.heading': 'This run', 'summary.hint': 'Every doodle you used and how it went. 1200×630 image for socials',
  'summary.save': 'Save image', 'summary.copy': 'Copy image', 'summary.link': 'Copy fight link',
  'summary.linkTitle': 'A link that lets others fight this doodle. Post it with the image',
  'summary.copied': 'Image copied', 'summary.copyFail': 'Clipboard unavailable here, use Save',
  'summary.linkCopied': 'Fight link copied ({n} chars)', 'summary.linkFallback': 'Link placed in the box below',
  'summary.clear': 'Cleared! {wins} wins', 'summary.dead': 'Fell after {rounds} rounds with {wins} wins',
  'summary.sub': 'Rakugaki Brawl · perks {perks} · seed {seed}', 'summary.tag': '#RakugakiBrawl',
  'share.summary': 'Fight a friend (share code)', 'share.copy': 'Copy this doodle\'s code', 'share.paste': 'Paste a friend\'s code',
  'share.use': 'Fight this doodle', 'share.hint': 'The code is the doodle itself. No server: their drawing becomes your next enemy.',
  'share.drawFirst': 'Draw something first', 'share.copied': 'Copied ({n} chars)', 'share.fallback': 'Placed in the box below',
  'share.next': 'Next round: the shared doodle', 'share.bad': 'Cannot read that code: {msg}',
  'share.linkNext': 'The linked doodle is your next opponent', 'share.linkBad': 'Cannot read the code in the link',
  'stat.atk': 'ATK', 'stat.spd': 'SPD', 'stat.reach': 'Reach', 'stat.element': 'Element', 'stat.spikes': 'spikes',
  'color.black': 'black', 'color.red': 'red', 'color.green': 'green', 'color.blue': 'blue',
  'trait.shield': 'Shield {n} (loops → damage taken -{n})', 'trait.eyes': 'Eyes {n} (crit +{pct}%)', 'trait.legs': 'Legs {n} (speed +{v})',
  'trait.arms': 'Arms {n} (attack +{v})', 'trait.none': 'No shape traits yet (draw loops, eyes, legs or arms)',
  'you': 'You', 'rival': 'Past self (R{round})', 'friend': "Friend's doodle", 'nextEnemy': 'Next: {name}',
  'round.log': 'Round {round}: {a} ({ahp}HP/{aatk}ATK) vs {b} ({bhp}HP/{batk}ATK)',
  'win': 'WIN!', 'lose': 'Lost…', 'draw': 'Draw', 'hit.super': ' super', 'hit.weak': ' weak',
  'gameover': 'Game over. {wins} wins', 'cleared': 'Cleared! {wins} wins / {max} rounds',
  'status': 'Round {round}/{max} · lives {lives} · {wins} wins', 'status.perks': ' · perks {n}',
  'ach.unlocked': 'Achievement: {name} — {desc}', 'ach.toast': 'Achievement  {name}', 'perk.picked': 'Upgrade: {name}',
  'perk.ink.name': 'Ink pot', 'perk.ink.desc': 'Ink cap +900', 'perk.atk.name': 'Sharp pencil', 'perk.atk.desc': 'Attack +20%',
  'perk.hp.name': 'Cardboard', 'perk.hp.desc': 'HP +20%', 'perk.spd.name': 'Quick sketch', 'perk.spd.desc': 'Speed +15%',
  'perk.crit.name': 'Party trick', 'perk.crit.desc': 'Crit chance +10%', 'perk.reach.name': 'Long arms', 'perk.reach.desc': 'Reach +15',
  'ach.first_win.name': 'First blood', 'ach.first_win.desc': 'Win a round',
  'ach.clear_run.name': 'Full run', 'ach.clear_run.desc': 'Survive all 10 rounds',
  'ach.full_creature.name': 'Fully loaded', 'ach.full_creature.desc': 'Fight with a doodle that has a shield, eyes, legs and arms',
  'ach.beat_rival.name': 'Past tense', 'ach.beat_rival.desc': 'Beat a past self',
  'ach.share_fight.name': 'With friends', 'ach.share_fight.desc': 'Fight a doodle from a share code',
  'ach.idle_streak_5.name': 'Idle master', 'ach.idle_streak_5.desc': 'Win 5 in a row in idle mode',
  'lang.toggle': '日本語',
};

const dict: Record<Lang, Record<Key, string>> = { ja, en };
export const LANGS: Lang[] = ['ja', 'en'];

let current: Lang = 'ja';

export function lang(): Lang { return current; }

export function setLang(l: Lang, kv?: { setItem(k: string, v: string): void }): void {
  current = l;
  try { kv?.setItem(LANG_KEY, l); } catch { /* ignore */ }
}

/** Resolve the initial language: ?lang= beats storage beats the browser's preference. */
export function detectLang(search: string, stored: string | null, navLang: string): Lang {
  const q = new URLSearchParams(search).get('lang');
  if (q === 'en' || q === 'ja') return q;
  if (stored === 'en' || stored === 'ja') return stored;
  return navLang.toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

export { LANG_KEY };

export function t(key: Key, params: Record<string, string | number> = {}): string {
  const s = dict[current][key] ?? ja[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k: string) => (k in params ? String(params[k]) : `{${k}}`));
}

/** Fill every element carrying data-i18n (text) or data-i18n-title / -placeholder. */
export function applyStatic(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n as Key); });
  root.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle as Key); });
  root.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder as Key); });
}
