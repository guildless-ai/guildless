# Steam リリース計画（2026-10-09 時点の事実と 10/11 までにやること）

## 事実（Steamworks 公式ドキュメントの記述。検索結果経由で確認。partner.steamgames.com はこの環境から直接開けなかった）

| 項目 | 内容 | 出典 |
|---|---|---|
| 登録料 | 1 タイトルにつき 100 USD（Steam Direct） | https://partner.steamgames.com/steamdirect |
| 支払い後の待機 | 最初の数タイトルは「支払いからリリースまで 30 日の待機期間」 | https://partner.steamgames.com/doc/gettingstarted/onboarding |
| Coming Soon ページ | リリース前に最低 2 週間、公開状態である必要がある | https://partner.steamgames.com/doc/store/coming_soon , https://partner.steamgames.com/doc/store/releasing |
| ストアページ審査 | 通常 3〜5 営業日。公開希望日の 7 営業日前までに提出が推奨 | https://partner.steamgames.com/doc/store/review_process |
| ビルド審査 | ストア審査と別にビルド審査がある（同じく数営業日） | https://partner.steamgames.com/doc/store/review_process |
| 発売日の固定 | Coming Soon 公開後、発売日 14 日以内は Valve に連絡しないと変更不可 | https://partner.steamgames.com/doc/store/coming_soon |

結論: **10/11 に Steam で販売開始できる条件は「登録料を 30 日以上前に支払い済み」かつ「ストアページが 2 週間以上前から公開済み」のみ。** それ以外の場合、10/11 に到達できる最良の状態は「Steam に提出できる完成パッケージ」。

## 10/11 までに納品するもの（提出パッケージ）

1. Windows ビルド（electron-builder `win-unpacked`。SteamPipe で depot にそのままアップロードできる形）
2. Steamworks 連携（steamworks.js：実績 6 種の同期、オーバーレイ対応）。Steam 外では LocalPlatform にフォールバック
3. ストア素材: ヘッダー 460×215 / 小カプセル 231×87 / メインカプセル 616×353 / 縦カプセル 374×448 / ライブラリ 600×900 / ヒーロー 1920×620 / ロゴ / スクリーンショット 1920×1080 ×5
4. ストア文言（日本語・英語）: 短い説明、長い説明、タグ案、価格案
5. SteamPipe 用 `app_build.vdf` / `depot_build.vdf` の雛形
6. 本ファイルのチェックリスト（ユーザーが行う Steamworks 側の作業）

## ユーザーがやること（こちらからは実行不可）

- [ ] Steamworks パートナー登録と 100 USD の支払い、税務・銀行情報の入力
- [ ] App ID 取得 → `electron/steam_appid.txt` に記入
- [ ] ストアページ作成（素材と文言は本リポジトリの `store/` を使用）→ 審査提出 → Coming Soon 公開
- [ ] SteamPipe で `dist/win-unpacked` をアップロード → ビルド審査
- [ ] Coming Soon 公開から 2 週間後以降にリリース
