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

## 追加委任（2026-09-12 /loop 指示）

- 聞き返さない。架電で売れるなら架電で売る。X MCP は情報源の一つに過ぎない。
- Guildless を自己改善型にし、EXE（既存 CLI/デスクトップ）を使う。アイデアが金になるまで AI 同士で解決し続ける。人間の成功・失敗事例はネット上の公開情報から学ぶ。
- 再現性優先か信用構築かは AI が選ぶ。
- 初期投資上限 10 万円（API 料金・広告費を含む）。無料でできること（動画投稿、X 投稿、アカウント作成）は自由に行ってよい。
- UGC 動画納品など企業から対価を得る手段も対象。法人（合同会社ココアル）として動く。

## /loop 反復1（2026-09-12 07:47 UTC）

- 架電チャネルを起動。Edge Function `guildless-call-campaign`（incagent-os）を新設。apotrail の `/api/campaigns` + `/auto-start` を使い、全件を `guildless_outreach_log`（channel=call）に記録。
- 判明した仕様: CSV 列名は ASCII（`TEL`）でないと電話列が検出されない。`/auto-start` は `confirm_test_calls=YES` を要求する（apotrail 自身の確認ゲート。所有者の明示委任に基づき AI が確認を付与）。
- 実行: campaign `spot_call_demo_requesters_2026_09_12` → apotrail campaign `20e16939-ab1b-4b40-b10c-940d2a56dd7f`、デモ申込者5件、status running、発信時間 9〜19 JST。
- 費用: 直近60日の発信は接続1件あたり約 $0.15〜0.17（`call_logs.provider_cost_usd`）。上限10万円に対し無視できる。
- 次の反復: `call_campaign_contacts.call_result` と `call_logs` で結果確認。Stripe 決済確認。Indeed 受付募集39社（電話確認済）は受電向けオファー（ONCALL ライト 29,800円/月の既存価格）で別キャンペーンを検討。

## /loop 反復2（2026-09-12 08:35 UTC）

- 反復1の結果: デモ申込者5件（携帯）は全件不通・留守電。留守電ループ3件が各271秒・約$1.06。合計約$3.46。学習は `guildless_money_cases` の `own-call-demo-requesters-2026-09-12` に記録。改善: 留守電/IVRは30秒以内に切る指示を台本へ追加、固定電話・平日日中を優先。
- 2本目のオファーを起動: AI受電（既存 Stripe 価格 ONCALL ライトプラン 29,800円/月）。Payment Link https://buy.stripe.com/aFabJ0fRgder1uxgeu8AE08。納品は手動（専用番号払い出し）。
- 実行: campaign `oncall_light_reception_leads_2026_09_12` → apotrail `4cef694d-4ef8-4a7f-9829-ed2a49eb146b`、Indeed 受付募集企業の固定/0120 番号 40件、9〜18 JST、running。メール `oncall_light_email_2026_09` 5通送信（公開採用アドレス、法3条1項3号）。
- Stripe: 新規決済なし（最終 2026-05-28）。
- 次の反復: 40件の通話結果（`call_campaign_contacts.call_result`、`call_logs.gate_result/dm_result`）、メール返信、決済。接続率が0なら台本/時間帯を変える。

## /loop 反復3（2026-09-12 08:50 UTC）

**質問への事実回答**
- メール営業: 実施済み 25通（デモ申込6、登録者12、元顧客2、公開採用アドレス5）。全件 Resend 受理。返信は reply@oncall.jp / admin@kokoaru.jp に届くため、この環境からは未確認。
- フォーム営業: 未実施。リードにフォームURLが無く、既存の `incagent-cdp` は Cloudflare Browser Rendering でフォーム構造を探索するだけで送信機能が無い。
- アポトレール LP の折り返し通話: 2026-09-11 11:58 UTC 以降の3件は `model_used = gpt-live-1`（voice ash）。それ以前（8/29〜9/10）は `grok-voice-think-fast-2.0`。つまり GPT live への切替は 9/11 に行われている（`call_logs.model_used` で確認）。

**架電の途中結果（40社中19社完了）**: 0120/0100 番号13件は全件0秒不通（発信回線から着信課金番号へ繋がらない）。03番号は2件接続（1件は診療時間外案内、1件は6秒で切断）、3件0秒不通。学習は `own-call-reception-leads-2026-09-12` に記録。対策: 着信課金番号を架電対象から除外（関数側でフィルタ）。

## 訂正（2026-09-12 09:10 UTC）

- 誤り: 金曜17時台に架電を開始し、0120 番号を対象に含め、9〜18 時枠のまま放置したため土曜に自動再開する状態だった。所有者の指摘で即時修正。
- 対処: apotrail campaign `4cef694d…` を `paused` に変更（土日は発信しない）。未架電21件（固定電話のみ、0120除外済み）は `guildless_outreach_log` で `queued` に戻し、月曜 10:00〜12:00 JST に再開する。
- ルール追加: **B2B 架電は平日 10〜12 / 14〜16 JST のみ。土日祝・17時以降は発信しない。着信課金番号（0120/0800/0570）と未検証番号は対象外。携帯番号への営業架電は本人がデモ申込した場合のみ。**
