# shipguard

> 個人開発者のための事前ローンチ・セキュリティ＆設定監査CLI。
> サーバー不要・外部費用0円・ローカル完結で、デプロイ直前の設定不備や秘密情報漏洩を検知します。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Release: v0.1.0](https://img.shields.io/badge/release-v0.1.0-orange.svg)](https://github.com/tk030-lotto/shipguard/releases)

---

## なぜ shipguard なのか？

個人開発者が本番公開前に直面しやすい見落としを機械的に確認します。
- `.env` に入れたはずの Stripe の秘密鍵がソースコードに混ざっていないか？
- Supabase の RLS を有効化し忘れて、テーブルが開放状態になっていないか？
- 開発用の `CORS: *` がそのまま本番に残っていないか？

`shipguard` はリポジトリを静的解析し、ローンチ前に確認すべき設定不備や秘密情報の混入を洗い出します。外部通信は行わず、サーバー運用費・外部サービス費用0円・ローカル環境（Node.js >= 18）で動作します。

## 主な特徴

- **スタンドアロン動作 & 運用費0円**: APIサーバーや外部SaaSへの依存なし。アカウント登録不要で、ローカル端末またはCI上で実行できます。
- **個人開発向けの監査ルール**:
  - **SEC-001**: ハードコードされたAPIキー（Stripe, OpenAI, Resend, AWS 等）の漏洩検知（既定でスニペット内の秘密文字列もマスク表示）
  - **SEC-002**: クライアント公開環境変数（`NEXT_PUBLIC_`, `VITE_` 等）への秘密鍵混入検知（`.env.example` / `.env.sample` / `.env.template` はテンプレートのため検査対象外、`.env` 本体とソースコードを検査）
  - **SEC-003**: Supabase / PostgreSQL の Row Level Security (RLS) 未設定テーブル検知（`database.migrationsDir` 配下の複数マイグレーション横断解析・`database.excludeTables` 対応）
  - **SEC-004**: ソースコードや設定内のワイルドカード CORS (`*`) 検知
  - **CFG-001**: `.env.example` / `.env.template` とローカル `.env` / `.env.local` のキー定義乖離検知
- **走査時の自動除外とサイズ上限**:
  - `.gitignore`、`**/.shipguard/**`、`node_modules`、`dist`、テストファイル（`**/test/**`, `**/*.test.*` 等）、バイナリファイルを自動除外します。
  - 既定の上限サイズ（2MB、`scan.maxFileSizeBytes` で変更可）を超えるファイルは警告を出してスキップします。
- **実行ログの永続化**: スキャン結果は `.shipguard/audit.log`（NDJSON、Git コミットハッシュ付き）に自動記録され、過去の履歴を追跡できます（UI 起動時の自動スキャンはログに混ぜません）。
- **CI/CD 連携**: GitHub Actions 等に組み込み、違反検知時は終了コード 1 でデプロイを遮断します。

## インストール（GitHub Releases）

`shipguard` は npm レジストリには公開していません（npm 上の同名パッケージは別プロジェクトです）。[GitHub Releases](https://github.com/tk030-lotto/shipguard/releases) からリリース版 zip をダウンロードして利用してください（必要環境: Node.js >= 18.0.0）。

```bash
# 1. GitHub Releases から shipguard-v0.1.0.zip をダウンロードして展開
unzip shipguard-v0.1.0.zip -d shipguard

# 2. 監査したいプロジェクトのディレクトリで実行
cd /path/to/your-project
node /path/to/shipguard/bin/shipguard.js scan
```

ソースからビルドして利用する場合:

```bash
git clone https://github.com/tk030-lotto/shipguard.git
cd shipguard
npm ci
npm run build
node bin/shipguard.js --version
```

## クイックスタート

### 1. 設定ファイルの生成（初回のみ）

```bash
node /path/to/shipguard/bin/shipguard.js init
```

カレントディレクトリに `.shipguardrc.json` が生成されます。

### 2. 監査スキャンの実行

```bash
node /path/to/shipguard/bin/shipguard.js scan
```

#### 実行オプション

```bash
# critical/high に加え medium/low を含む全レベルの違反が1件でもあれば終了コード 1 を返す
node /path/to/shipguard/bin/shipguard.js scan --strict

# スキャン後に HTML レポートを生成（既定: .shipguard/report.html）してブラウザで開く
node /path/to/shipguard/bin/shipguard.js scan --open

# スタンドアロン HTML レポートを指定パスへ出力
node /path/to/shipguard/bin/shipguard.js scan --format html -o report.html

# HTML レポートを既定出力先 (.shipguard/report.html) へ出力
node /path/to/shipguard/bin/shipguard.js scan --format html

# Markdown 形式で標準出力（-o 未指定時は標準出力）
node /path/to/shipguard/bin/shipguard.js scan --format markdown

# Markdown ファイルにレポートを保存
node /path/to/shipguard/bin/shipguard.js scan --format markdown -o audit-report.md

# JSON 形式で標準出力
node /path/to/shipguard/bin/shipguard.js scan --format json

# 設定ファイルの ignore と合成して追加の除外 Glob パターンを指定
node /path/to/shipguard/bin/shipguard.js scan --ignore "scripts/**" "tmp/**"

# 検知された秘密情報の原文をスニペットに表示（既定はマスク表示）
node /path/to/shipguard/bin/shipguard.js scan --show-secrets
```

#### 終了コード

- `0`: 違反なし（または `--strict` 未指定で `medium` / `low` のみ）
- `1`: 遮断対象の違反を検知（通常は `critical` / `high`、`--strict` 指定時は全レベルが1件以上）
- `2`: 実行時エラー（`.shipguardrc.json` の構文/スキーマエラー、不明な `--format`、対象パス不在など）

### 3. ローカル Web UI ダッシュボードの起動

ターミナルだけでなく、ブラウザ（`http://127.0.0.1:3773`、ループバック限定バインド）から監査結果と実行履歴を確認・再実行できます（外部通信なし・0円ローカル完結）。
画面上部からスキャン対象プロジェクトフォルダやファイルを切り替えて監査できます。

#### 方法A: ワンクリック起動（Windows / ターミナル操作不要）
展開フォルダ直下の `shipguard-ui.bat` をダブルクリックすると、ブラウザでダッシュボードが立ち上がります。

#### 方法B: コマンドラインから起動
```bash
node /path/to/shipguard/bin/shipguard.js ui
```

## 設定ファイル (`.shipguardrc.json`)

プロジェクト固有の要件に合わせてルールや除外設定をカスタマイズできます。構文エラーや未知キー・不正値がある場合は終了コード `2` で停止します。

```json
{
  "$schema": "https://raw.githubusercontent.com/tk030-lotto/shipguard/main/schema.json",
  "ignore": [
    "**/*.test.ts",
    "docs/**"
  ],
  "rules": {
    "SEC-001": "critical",
    "SEC-002": "high",
    "SEC-003": "high",
    "SEC-004": "medium",
    "CFG-001": "low"
  },
  "database": {
    "migrationsDir": "supabase/migrations",
    "excludeTables": ["audit_events", "spatial_ref_sys"]
  },
  "logging": {
    "enabled": true,
    "path": ".shipguard/audit.log"
  },
  "scan": {
    "maxFileSizeBytes": 2097152
  }
}
```

- `database.migrationsDir`: `SEC-003` の走査対象とする SQL マイグレーションディレクトリ（既定: `"supabase/migrations"`）。
- `database.excludeTables`: `SEC-003` で RLS 検証から除外するテーブル名配列。
- `logging.path`: 対象ディレクトリ内の相対パスを指定します（対象ディレクトリ外を指す指定は拒否されます）。

## 監査ログの確認

`shipguard scan` は実行ごとに検証サマリー（Git コミットハッシュ含む）を `.shipguard/audit.log` へ保存します。

```bash
# 過去の監査ログサマリーを表示（破損行がある場合はスキップ件数を警告表示）
node /path/to/shipguard/bin/shipguard.js history
```

ログファイル（`.shipguard/audit.log`）は NDJSON 形式で出力されるため、`jq` 等でパースできます。

```bash
cat .shipguard/audit.log | jq 'select(.passed == false)'
```

## CI/CD 統合（GitHub Actions）

利用者のリポジトリでは GitHub Releases の zip を取得・展開して `node` で実行します（`npx shipguard` は使用しません）。

```yaml
name: Pre-Launch Audit

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
        with:
          node-version: 20
      - name: Download shipguard release
        run: |
          curl -fsSL -o /tmp/shipguard.zip https://github.com/tk030-lotto/shipguard/releases/download/v0.1.0/shipguard-v0.1.0.zip
          unzip -q /tmp/shipguard.zip -d /tmp/shipguard
      - name: Run shipguard scan
        run: node /tmp/shipguard/bin/shipguard.js scan --strict
```

## ライセンス

MIT License
