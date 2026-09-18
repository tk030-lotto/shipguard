# shipguard 開発記録（RECORD.md）

本ドキュメントは、プロジェクト「shipguard」の開発経緯、技術的決定、および発信知見を永続的に記録するログです。

---

## 2026-09-18: プロジェクト初期設計および仕様書の策定・多層化改訂

### 1. 変更・実装内容
- **プロジェクト基盤文書の整備**:
  - `README.md`, `REQUIREMENTS.md`, `SPECIFICATIONS.md` を策定し、GitHubプライベートリポジトリとの連携・Pushを完了。
- **アーキテクチャの多層化設計**:
  - `Scanner` → `Rule Engine` → `Config Filter` → `Severity Resolver` → `Reporter & Logger` の多層パイプラインを定義。
- **`SEC-003` (RLS検知) の誤検知防止仕様**:
  - 単一ファイルの正規表現マッチから、複数マイグレーションファイルを横断した `CREATE TABLE` と `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` の突合ロジックへ高度化。
  - `.shipguardrc.json` での `database.excludeTables` による除外設定に対応。
- **表現・ポジショニングの適正化**:
  - 「保守ゼロ」の表現を「サーバー運用費・外部サービス費用0円のローカル完結型CLI工具」へと改訂。

### 2. 技術的決定・背景
- **ノイズ（誤検知）の低減**:
  - 個人開発者が利用するCLIにおいて、誤検知による警告過多はツールの信頼性低下と形骸化を招くため、静的ファイル走査とルール判定、設定による例外除外を分離する多層アーキテクチャを採用。
- **0円・保守ゼロの実態定義**:
  - 外部APIやサーバー、SaaSバックエンドを持たない「ローカル完結型工具」とすることで、運用コストとサービス障害リスクを原理的にゼロ化。
- **段階的実装（Phase 1〜3）の採用**:
  - 最初から全機能を実装するのではなく、Phase 1（コア走査・シークレット検知・Exit Code制御）で最小動作を確立した上で、ルール拡充（Phase 2）、レポーター・CI（Phase 3）へと進めるアプローチを決定。

### 3. 📝 記事ネタ・発信知見
- **提供価値**:
  - 個人開発者が「見落としへの不安（Stripeキー露出やSupabase RLS忘れ）」からローンチを躊躇する課題を、外部サービス不要・ローカル数秒で解消するアプローチ。
- **技術的知見・ブレイクスルー**:
  - 「正規表現セキュリティ監査の限界と解決策：複数マイグレーションファイルに跨るRLS有効化判定の設計」
  - 「外部通信なし・アカウント登録不要・サーバー代0円で成立させる個人開発者向けCLIツールの作り方」
- **タイトル・キャッチコピー案**:
  - 「【個人開発】個人で作ったWebアプリを本番公開する前の『ヒヤリハット』をゼロにするCLIを作った」
  - 「SupabaseのRLS忘れ・Stripeキー漏洩をデプロイ直前にローカルで弾く『shipguard』のアーキテクチャ」

---

## 2026-09-18: Phase 1 コア最小構成の実装完了

### 1. 変更・実装内容
- **TypeScriptビルド・実行環境の構築**:
  - `package.json`, `tsconfig.json`, `tsup.config.ts` を配備。ESM/NodeNext環境でビルド完了（`dist/` 出力）。
- **コア型定義 (`src/types/index.ts`)**:
  - `Violation`, `FileEntry`, `Rule`, `ScanContext`, `ScanResult`, `ShipguardConfig` を定義。
- **ファイル収集エンジン (`src/core/scanner.ts`)**:
  - `fast-glob` と `ignore` を用いた `.gitignore` 準拠の走査ロジック。
  - テストファイル、バイナリファイル、2MB超の巨大ファイル、ロックファイル等の自動除外。
- **シークレット検知ルール (`src/rules/secrets.ts`)**:
  - `SEC-001`: Stripe, OpenAI, GitHub PAT, AWS Access Key, Resend, Slack, Google API Key 等のハードコード検知。
  - 検知トークンの安全なマスキング表示（例: `sk_live...3456`）、および `.env.example` 等のプレースホルダー除外ロジック。
- **CLIスキャンコマンド & エントリーポイント (`src/commands/scan.ts`, `src/cli.ts`, `bin/shipguard.js`)**:
  - `commander` による `shipguard scan` コマンド。
  - `picocolors` を用いたターミナル出力（重要度バッジ・該当コード表示・サマリーテーブル）。
  - Exit Code制御（重大違反検知時は `1`、合格時は `0`）。
- **単体テスト (`test/secrets.test.ts`, `test/scanner.test.ts`)**:
  - `vitest` による全4テスト全件PASS、および `tsc --noEmit` 型検証PASS。

### 2. 技術的決定・背景
- **ビルドツール選定**:
  - 高速かつ最小構成でESMおよびTypeScript型定義（d.ts）を出力できる `tsup` を採用。
- **テストファイルのノイズ除外**:
  - テストコード自体に含まれるモックシークレットが本番監査で誤検知されることを防ぐため、`DEFAULT_IGNORE` にテストディレクトリ・ファイルを標準除外として追加。
- **300行原則の徹底**:
  - 全ファイルを154行以下に分割し、1ファイル1責務を堅持。

### 3. 📝 記事ネタ・発信知見
- **提供価値**:
  - 静的解析CLIにおける「モックシークレットと実シークレットの境界」「Exit CodeによるCIパイプラインの停止機構」の設計パターン。
- **タイトル案**:
  - 「TypeScript + tsup + vitest で作る、依存最小のセキュリティ監査CLI開発記（Phase 1: コアエンジンの確立）」

---

## 2026-09-18: Phase 2 監査ルール拡充および設定連携の実装完了

### 1. 変更・実装内容
- **設定スキーマ定義とZodバリデーション (`src/config/schema.ts`, `src/config/loader.ts`)**:
  - `zod` による `.shipguardrc.json` の型定義とバリデーション。
  - ルール個別重要度のオーバーライド（`critical`, `high`, `medium`, `low`, `off`）および安全なフォールバック。
- **環境変数監査ルール (`src/rules/env.ts`)**:
  - `SEC-002`: `NEXT_PUBLIC_` や `VITE_` 等の公開プレフィックスが付与された機密情報（`SECRET`, `SERVICE_ROLE` 等）の誤用検知。
  - 公開前提のキー（`ANON`, `PUBLISHABLE`, `PUBLIC_KEY`）をホワイトリスト化して誤検知を排除。
  - `CFG-001`: `.env.example` の定義キーがローカルの `.env` / `.env.local` に未定義である状態を検知。
- **データベース RLS 監査ルール (`src/rules/database.ts`)**:
  - `SEC-003`: プロジェクト内の全マイグレーションSQLファイルを横断解析し、`CREATE TABLE` されたテーブル名に対して `ENABLE ROW LEVEL SECURITY` が一度も適用されていないテーブルを検知。
  - `.shipguardrc.json` の `database.excludeTables` に指定されたテーブルの除外処理に対応。
- **CORS設定監査ルール (`src/rules/cors.ts`)**:
  - `SEC-004`: `Access-Control-Allow-Origin: *` や `cors({ origin: "*" })` などの過度に寛容なCORS設定を検知。
- **ルールエンジン統合とテスト拡充 (`src/rules/index.ts`, `test/`)**:
  - 全5ルールを統合実行し、全8テストファイル・25テストケース全件合格（単体テスト＋E2E統合テスト）。
  - `tsc --noEmit` および `tsup` ビルドの正常終了を確認。
  - 全TypeScriptコードで300行以内を維持（最大177行）。

### 2. 技術的決定・背景
- **Supabase/PostgreSQLにおける実用的なRLS判定**:
  - 単一ファイル内の正規表現では「テーブル作成SQL」と「後から別マイグレーションでRLS有効化SQLを追加するケース」を誤検知してしまうため、プロジェクト内の全SQLファイルを収集して集合突合（Set diff）を行うアルゴリズムを採用。
- **公開用トークンのホワイトリスト除外**:
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` や `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` はフロントエンドで必須のキーであるため、単に `KEY` を含むからと警告を出さず、安全な公開用プレフィックス・サフィックスを認識してノイズを防止。

### 3. 📝 記事ネタ・発信知見
- **提供価値**:
  - 「Supabaseを使っている個人開発者が本番公開前に最も青ざめる『RLS未設定』事故を、0円・ローカル完結で確実に防ぐ仕組み」
- **技術的知見・ブレイクスルー**:
  - 「なぜ単一ファイル正規表現のセキュリティ検知は破綻するのか：マイグレーション横断突合とノイズゼロ化の技術」
  - 「Stripe / Supabase / Clerk のキーを誤認させないためのコンテキスト認識型静的解析手法」


