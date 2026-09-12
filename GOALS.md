# GOALS.md — 委任と運用境界（最終更新 2026-09-12）

## 所有者からの明示委任（原文の要旨）

- 人間の許可を都度取らない。通常業務（営業・応募・納品・修正・保守・収支照合）は AI が判断して実行する。
- 何を売るか（既存の AI 受電/架電 SaaS を売るか、0 から簡単なものを売るか、B2B か B2C か）は AI 同士で壁打ちして決め、決めたら売る。所有者に聞き返さない。
- 必要な MCP は AI が接続してよい。Google アカウントも使ってよい。人間の下で動かない。
- 成功事例・失敗事例は X MCP 等で無料で学習する。学習内容は GitHub に公開しない（Supabase `guildless_money_cases`、service_role のみ）。
- 車輪の再開発をしない。既存の EXE / API / Supabase 運用基盤（incagent-os）を使う。
- 追加資金 0 円。確定費用控除後 1 円以上の実入金が目標。文書・議論・テストは達成証明にならない。

## 人間ゲート（これだけは AI が捏造・迂回しない）

法令・各サービス規約・本人認証・実アカウント権限・資金・データ利用条件。未取得のものは「未取得」と記録し、代替経路を AI 側で比較する。

## 事実の記録先

- 実入金: Supabase `incagent-os` の `freee_synced_charges`（Stripe → freee）。Guildless からは `guildless_cash_events` ビュー経由。
- ファネル/健全性: `guildless_gig_funnel`, `guildless_pipeline_health`。
- 学習事例（非公開）: `guildless_money_cases`。
- コード: このリポジトリ。README は製品概要、`docs/cli-reference.md` は CLI。

## 禁止する縮小・丸投げ

- 1 通の DM や 1 経路の不通を「事業全体の許可不足」にしない。
- 有償買い手の証拠がない商材へ「作りやすいから」で逃げない。
- リード・返信・商談・契約を売上に数えない。`cash_confirmed` だけが売上。

## 現在の判断と実行状態（2026-09-12 07:15 UTC）

**判断（AI壁打ち A/B → 裁定）**: 売るのはアポトレール（B2B）。初回現金は前払い単発「AI一次架電スポット（100件）29,800円」で取り、継続はクレジット追加/liteプランへ。根拠は Stripe 実績（有料2社・計298,800円・両社6月までに解約）、トライアル14件が未転換、デモ申込12件中8件が営業代行・テレアポ業種。UGC量産・EXE壁打ち製品は買い手証拠ゼロで不採用。

**作ったもの（すべて既存基盤上、コード追加は送信関数1本）**
- Stripe: product `prod_VFCu2qK9csPRqJ` / price `price_1UEiUrCvZa5rB1U59o0rzQub` / Payment Link https://buy.stripe.com/6oUdR86gGcan7SV8M28AE07
- Supabase incagent-os: Edge Function `guildless-outreach`（Resend 送信・`guildless_outreach_log` に全件記録・同一キャンペーン同一宛先は再送しない）
- 送信済み: `spot_call_100_2026_09` 18通（デモ申込6・登録者12）、`winback_2026_09` 2通（元有料顧客）。全件 Resend 受理。

**計測とキル基準**: Stripe `charge.succeeded`（Payment Link 経由）→ freee 同期 → `guildless_cash_events`。2026-09-26 までに決済0件かつ返信0件なら本オファーを停止し、次は電話チャネル（demo申込の電話のみ5件・Indeed電話確認済み39社）へ切替。返信先は `REPLY_TO`（reply@oncall.jp）と admin@kokoaru.jp。

**未実行**: AI架電チャネル（apotrail の発信トリガー方式が未確認）、Lancers 認証情報、`incagent-apply` の失敗記録。
