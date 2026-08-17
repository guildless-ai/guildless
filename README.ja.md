# Guildless（日本語）

![Guildless](assets/guildless-icon.png)

Guildlessは、会社の目標を調査・判断・実行・証拠・入金まで閉じる、ローカル優先のAI企業運営OSです。

利用者が入力するのは、たとえば次の一文だけです。

> この会社を伸ばして。まず30日で月商を100万円増やして。

Guildlessは、会社の資産・能力・顧客・販路・資本を許可された情報から復元し、市場・成功事例・失敗事例・競合を調べ、複数の事業案を比較します。選んだ案は、承認境界を守って実行し、実入金を証拠付きで記録します。

## Guildlessの流れ

```text
目標
 ↓
会社理解（事実と根拠）
 ↓
不足能力の発見
 ↓
Local → GitHub → public-apis → npm/PyPI → Hugging Face → MCP → Browser/Web
 ↓
戦略比較 → Money Bet
 ↓
承認された範囲で実行
 ↓
確認済み成果・入金
 ↓
次の判断へ学習
```

経営者に表示するのは「今何をしているか」「何が分かったか」「何を決めたか」「次は何をするか」「人間が必要か」「いくら確認できたか」です。モデル名、Agent名、tool call、内部タスクは経営画面に出しません。

## 主な構成

- `guildless verify`：commit・コマンド・HTTP・検証範囲を機械的に確認する完了ゲート
- `python/guildless_v0/core/`：証拠付き事例、Playbook、Money Bet、確認済み入金
- `capability-acquisition/`：既存能力・GitHub・public-apis・パッケージ・モデル・MCP・ブラウザの候補調達
- `docs/`：Executive Operating Viewと安全境界

public-apisは候補を探すための索引です。公式情報、稼働、認証、料金、商用条件、rate limit、実リクエストを確認するまで採用しません。

## 検証

```sh
npm install
npm run check
npm test
npm run build
npm run lint
python python/run_tests.py
node capability-acquisition/test_acquisition.js
```

## 安全境界

- 外部送信、契約、決済、公開、削除は承認前に停止
- Founder Memory Raw DBとHistorical Benchmark DBへ直接接続しない
- 事実と推論を分離し、事実には根拠を付ける
- 未検証のOSS/APIを自動実行しない
- リード、返信、商談、契約は入金ではない。証拠付き実入金だけを売上として数える

## ライセンス

MIT License。外部由来コードはLICENSE/NOTICEと取得コミットを記録します。
