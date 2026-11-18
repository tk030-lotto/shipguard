# shipguard v0.1.0

個人開発者のための事前ローンチ・セキュリティ＆設定監査CLI `shipguard` の初回リリースです。

## 主な機能

- **静的解析セキュリティ監査**:
  - **SEC-001**: ハードコードされた秘密鍵・APIトークン（Stripe, OpenAI, Resend, AWS 等）の検出（既定でスニペットもマスク表示、`--show-secrets` で原文表示）
  - **SEC-002**: 公開用クライアント環境変数（`NEXT_PUBLIC_`, `VITE_` 等）への秘密鍵混入検出（`.env.example` / `.env.sample` / `.env.template` は検査対象外）
  - **SEC-003**: Supabase / PostgreSQL の Row Level Security (RLS) 未設定テーブル検出（`database.migrationsDir` 配下の横断解析・`database.excludeTables` 除外対応）
  - **SEC-004**: ソースコードや設定内のワイルドカード CORS (`*`) の放置検出
  - **CFG-001**: `.env.example` / `.env.template` と実際の `.env` / `.env.local` とのキー定義乖離検出
- **多形式レポート出力**:
  - ターミナル表示（既定）
  - JSON形式（`--format json` で標準出力、`-o <path>` 指定時は指定ファイルに保存）
  - Markdown形式（`--format markdown` で標準出力、`-o <path>` 指定時は指定ファイルに保存）
  - HTML形式（`--format html` または `--open` で `-o` 未指定時は `.shipguard/report.html` に保存、`-o <path>` 指定時は指定ファイルに保存）
- **監査ログの永続化**:
  - `scan` 実行結果を `.shipguard/audit.log` (NDJSON、Git コミットハッシュ付き) に自動記録
- **ローカル Web UI**:
  - `node bin/shipguard.js ui` コマンドまたは Windows バッチ `shipguard-ui.bat` で `127.0.0.1:3773` にサーバーを起動しブラウザで表示
  - フォルダ・ファイル選択ダイアログ対応
  - 過去の監査ログ履歴の閲覧
- **CI/CD 連携**:
  - 重大（`critical` / `high`）な違反検出時に Exit Code 1 を返し、デプロイやマージを遮断（`--strict` 指定時は `medium` / `low` を含む全レベルで Exit Code 1、実行エラー時は Exit Code 2）
  - `--ignore "<glob>"` による追加の除外パターン指定に対応

## 利用方法（配布パッケージ zip から利用）

`shipguard` は GitHub Releases の zip パッケージとして配布しています（npm には公開していません）。必要環境: Node.js >= 18.0.0。

添付の `shipguard-v0.1.0.zip` を展開し、対象プロジェクトのディレクトリで以下のように実行します。

```bash
# 設定ファイルの生成（初回のみ）
node /path/to/shipguard/bin/shipguard.js init

# 監査スキャンの実行
node /path/to/shipguard/bin/shipguard.js scan

# HTML レポートを生成してブラウザで開く (.shipguard/report.html)
node /path/to/shipguard/bin/shipguard.js scan --open

# 全レベルの違反で停止
node /path/to/shipguard/bin/shipguard.js scan --strict

# 監査履歴の確認
node /path/to/shipguard/bin/shipguard.js history

# ローカル Web UI の起動
node /path/to/shipguard/bin/shipguard.js ui
```

- **Windows UI ワンクリック起動**: 展開フォルダ直下の `shipguard-ui.bat` をダブルクリック
