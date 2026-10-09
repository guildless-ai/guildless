# らくがきブロウル UI / やり込み 設計メモ（2026-10-09）

## 現状の問題（事実）
- 画面はフォーム的な 2 カラム（描く／バトル）で、タイトル画面・画面遷移・状態に応じた背景変化がない。
- 継続動機は「10 ラウンド 1 本」「強化 6 種」「実績 6 件」「放置の連勝」だけ。難易度の段階、日替わり、図鑑、解放要素がない。

## 参考にした作品と、取り入れる点
| 作品 | 取り入れる点 | 出典 |
|---|---|---|
| Balatro | 画面の状態で背景を変える（ボス・パック時）。1 つの視覚アイデンティティ（CRT）で統一。カード = 情報の単位 | [Medium: Balatro Design Analysis](https://medium.com/@yyh19971004/balatro-design-analysis-visual-packaging-and-interactive-feedback-cc6fa6a65370) |
| Vampire Survivors / Megabonk | レベルアップは「カードを 1 枚選ぶ」。UI は最小限で、成功時にだけ大きなフィードバック | [videogame.town](https://videogame.town/2025/10/08/megabonk-review-steam-pc-vampire-survivors/), [bugnet: juice](https://bugnet.io/blog/how-to-add-juice-to-your-ui) |
| Slay the Spire | デイリー（固定シード・全員同条件）、アセンション 20 段階、メタ進行は「教える／選択肢を増やす」で強さは与えない | [Wikipedia](https://en.wikipedia.org/wiki/Slay_the_Spire), [Steam 掲示板](https://steamcommunity.com/app/646570/discussions/0/1694920442957034147) |
| Hades | 強くなるのに合わせて難易度を自分で積む（Pact of Punishment）。やり直し自由 | [gamerant](https://gamerant.com/roguelite-games-with-best-progression-systems/) |
| Backpack Battles / Super Auto Pets | 盤面・店・資源の情報階層を分ける。何が起きたか後から確認できる。文字を読ませない | [itch.io 感想](https://itch.io/post/15626225) |
| めっちゃカメレオン | 「見逃しランキング」のように上達が数字で見える。小さなアップデートを高頻度で。配置ランダム化 | [gamerch 攻略](https://gamerch.com/mecha-chameleon/990961), [4Gamer 2.8.0](https://www.4gamer.net/games/007/G100712/20260717040/) |

## 方針
1. **UI**: タイトル → ラン → 結果 の 3 画面に分ける。紙（方眼ノート）＋マーカーの一貫した見た目。ボタンはステッカー風。状態で背景を変える（通常＝紙、ボス＝赤罫線、日替わり＝青罫線）。
2. **やり込み（強さを配らない）**:
   - **日替わりラン**: 日付からシード。全員同じ敵列。その日のベストを保存し、結果カードに「日替わり 10/09」を入れる。
   - **ランク（インク縛り）**: 0〜10。ランク r で自分のインク −4%·r、敵の予算 +8%·r。クリアで次ランク解放。
   - **図鑑**: 倒した敵の型（まるい／トゲ／ながい／ふとい × 目・脚・腕）と、自分の勝利作ギャラリー（読み込んで描き直せる）。
   - **解放は選択肢**: 極太ペン（ランク 1 クリア）、消しゴム（実績 3 つ）、スタンプ（日替わり 3 回完走）。数値は増やさない。
3. **見せ場の増幅**: クリティカル・決着・ランク更新だけに大きな演出。通常ヒットは小さく。

## 実装順
1. タイトル画面・画面遷移・紙の見た目・日替わり・ランク（この回）
2. 図鑑とギャラリー読み込み
3. 解放（ペン・消しゴム・スタンプ）とランク別背景
4. 結果カードにランク・日替わりを載せる
