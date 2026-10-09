# SteamPipe upload

1. Steamworks で App ID と Depot ID（Windows 64bit）を取得し、`app_build.vdf` / `depot_build.vdf` の `<APP_ID>` `<DEPOT_ID>` を置き換える。
2. `npm run dist:steam-win` で `release/win-unpacked/` を作る（Linux/macOS 上でも生成できる。署名は不要）。
3. Steamworks SDK の `tools/ContentBuilder/builder/steamcmd.exe` から:

```
steamcmd +login <account> +run_app_build <path>/steam/app_build.vdf +quit
```

4. Steamworks の「Builds」でアップロードしたビルドを `default` ブランチに設定。
5. 起動オプション（Launch Options）は `Rakugaki Brawl.exe`、OS: Windows。

実績の API 名は `src/platform.ts` の `AchievementId` を大文字にしたもの（例: `FIRST_WIN`）。Steamworks の Stats & Achievements に同名で登録する。

開発中に Steam 連携を試すときだけ、実行ファイルと同じ場所に `steam_appid.txt`（App ID のみ）を置く。**リリースビルドには同梱しない**。
