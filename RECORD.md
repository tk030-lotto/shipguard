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

---

## 2026-09-18: Phase 3 監査ログ永続化・マルチフォーマットレポーター・補助コマンドの実装完了

### 1. 変更・実装内容
- **監査ログ永続化機能 (`src/logger/index.ts`)**:
  - 仕様書第6項準拠の NDJSON（Newline Delimited JSON）追記モジュールを実装。
  - `git rev-parse HEAD` による Git コミットハッシュの安全な自動取得（Git非管理下でもフォールバック動作）。
  - `.shipguard/audit.log` への自動記録および設定ファイル（`logging.enabled`, `logging.path`）との連動。
- **マルチフォーマットレポーター (`src/reporter/`)**:
  - `src/reporter/json.ts`: 機械可読な JSON 出力機能。
  - `src/reporter/markdown.ts`: GitHub PR や CI レポートに適した洗練された Markdown 出力機能。
  - `src/reporter/index.ts`: `--format <terminal|json|markdown>` および `-o, --output <path>` オプションに対応した一元出力ディスパッチャ。
- **補助コマンドの実装 (`src/commands/init.ts`, `src/commands/history.ts`)**:
  - `shipguard init`: 設定ファイル `.shipguardrc.json` の雛形生成（既存ファイルの安全保護・`--force` オプション対応）。
  - `shipguard history`: `.shipguard/audit.log` の履歴を最新順に一覧表示（`-n, --limit` 表示件数制御、`--clear` ログ削除対応）。
  - エディタ補完用の JSON Schema（`schema.json`）をルートに配置し、`package.json` の配布対象に含める。
- **CI/CD連携とテスト網羅**:
  - `.github/workflows/shipguard.yml`: GitHub Actions による自動監査・Markdownレポート生成ワークフロー。
  - 単体・統合テストを拡充（全11テストファイル・41テストケース全件合格、型エラー0件、tsupビルド成功）。
  - 全TypeScriptコードで300行原則を徹底（最大177行）。

### 2. 技術的決定・背景
- **サーバー不要の監査追跡性（NDJSONローカルログ）**:
  - 外部DBやクラウドサービスを契約・運用せず、`.shipguard/audit.log` に1行1レコードのNDJSONで追記することで、Git管理外のローカル環境でも監査履歴・合否ステータスを時系列で高速・安全に確認可能にした。
- **CIパイプラインおよびPR連携の最適化**:
  - `--format markdown` と `--output` により、GitHub Actions 上で監査レポートを生成し、PRコメントやアーティファクトとしてそのまま掲示できる設計とした。

### 3. 📝 記事ネタ・発信知見
- **提供価値**:
  - 「外部サービス代0円・データベース不要。NDJSONを使ったローカル完結型CLI監査ログの設計思想」
  - 「個人開発のデプロイ事故を防ぐ：GitHub Actionsで動く自作セキュリティ監査ツールの作り方」
- **タイトル案**:
  - 「【個人開発】本番ローンチ前のセキュリティ事故を防ぐCLI『shipguard』を作った話（Phase 3: ログ永続化とCI統合）」
  - 「サーバーレス・DBレスで履歴管理できるTypeScript製CLIツールのアーキテクチャ」

---

## 2026-09-18: ローカルWeb UIダッシュボードおよびスタンドアロンHTMLレポーターの実装完了

### 1. 変更・実装内容
- **スタンドアロンHTMLレポーター (`src/reporter/html.ts`)**:
  - 外部通信・外部依存ゼロで完結する単一HTMLファイル出力機能（`--format html` / `-o <path>`）。
  - 深みのあるダークスレート・ネオンアクセントを取り入れたモダンUI、重要度別フィルター、エスケープによるXSS安全設計。
  - `--open` オプションによるスキャン直後のブラウザ自動起動（Windows: `start`, macOS: `open`, Linux: `xdg-open`）。
- **ローカルWeb UIダッシュボード (`src/commands/ui.ts`, `src/commands/ui-html.ts`)**:
  - `shipguard ui` コマンドによる軽量HTTPサーバー（`node:http`）起動とブラウザ自動オープン。
  - 最新の脆弱性カード一覧、過去の監査ログ（`.shipguard/audit.log`）タイムライン表示。
  - ブラウザ上からのワンクリック再スキャンAPI（`POST /api/scan`）。
- **テスト・品質検証**:
  - 単体・統合テスト（全13テストファイル・45テストケース全件合格、型エラー0件、tsupビルド成功）。
  - 全ソースファイルで300行原則を堅持（最大188行）。

### 2. 技術的決定・背景
- **0円・プライバシー保護を両立するUIビューア**:
  - クラウドサービスや外部SaaS、大型フロントエンドフレームワークを介さず、Node.js標準の `http` と Vanilla HTML/CSS/JS で構築することで、依存関係を増やさず完全ローカル完結の高速ダッシュボードを実現。

### 3. 📝 記事ネタ・発信知見
- **提供価値**:
  - 「ターミナルCLIツールにゼロ依存でリッチなWeb UIダッシュボードを生やす設計手法」
  - 「ReactもNext.jsも不要：Node.js標準ライブラリだけで作るローカル完結型開発者ダッシュボード」
- **タイトル案**:
  - 「【個人開発】CLIツールにワンコマンドでブラウザUIを付けて開発体験を劇的に上げる方法」

---

## 2026-09-18: ワンクリック起動ランチャー (bat) および動的ディレクトリスキャン機能の追加

### 1. 変更・実装内容
- **ワンクリック起動ランチャー (`shipguard-ui.bat`)**:
  - ターミナルを一切開かずに、ダブルクリックするだけで `shipguard ui` を立ち上げてブラウザを開くバッチファイルを配備。
  - **Windows文字コード・改行コード仕様厳守**: `cmd.exe` での構文エラー（`'eq' は、内部コマンドまたは外部コマンド...`）を防止するため、改行コードを確実に **CRLF (`0D 0A`)** に統一し、**Shift-JIS (CP932)** で保存。先頭に `chcp 932 >nul` を付与。
- **Web UI上での動的プロジェクトフォルダ選択・切替**:
  - `src/commands/ui-html.ts`: ヘッダー下にプロジェクトパスの入力バーを配備。Enterキーやボタンクリックで即座に対象フォルダを切り替えてスキャン実行可能に。
  - `src/commands/ui.ts`: `POST /api/scan` で `{ targetDir }` を受け取り、動的に指定フォルダを監査するAPIへ拡張。
- **テスト拡充**:
  - `test/ui.test.ts` に動的ディレクトリスキャンテストを追加（全13テストファイル・46テストケース全件合格）。

### 2. 技術的決定・背景
- **「ターミナル離れ」した直感的な開発体験**:
  - コマンドラインの操作に不慣れなケースや、別プロジェクトを連続してチェックしたい場合でも、ブラウザUI上のパス入力とダブルクリック用ランチャーだけで全機能を安全に実行可能にした。
- **Windowsバッチファイル特有の落とし穴と知見**:
  - `cmd.exe` は改行コードが LF (`\n`) のみだと行区切りを正常に判定できず、コマンド同士が不当に結合されてエラーとなるため、Windows用 `.bat` では「Shift-JIS (CP932)」と「CRLF (`\r\n`)」の双方が必須であることを実証・反映。


