# shipguard

> 個人開発者のための事前ローンチ・セキュリティ＆設定監査CLI。
> サーバー不要・外部費用0円・ローカル完結で、デプロイ直前の致命的な事故を防ぎます。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/badge/npm-v1.0.0-orange.svg)]()

---

## なぜ shipguard なのか？

個人開発者が本番公開を躊躇する最大の理由は「見落としへの不安」です。
- `.env` に入れたはずの Stripe の秘密鍵がフロントエンドに混ざっていないか？
- Supabase の RLS を有効化し忘れて、テーブルが全開放されていないか？
- 開発用の `CORS: *` がそのまま本番に残っていないか？

`shipguard` はリポジトリを数秒で静的解析し、ローンチを妨げる設定不備やセキュリティホールを洗い出します。外部通信は一切行わず、サーバー運用費・外部サービス費用0円で動作します。

## 主な特徴

- **完全スタンドアロン & 運用費0円**: APIサーバーや外部SaaSへの依存ゼロ。アカウント登録不要、ローカルまたはCI上で高速実行。
- **個人開発特化の多層監査ルール**:
  - ハードコードされたAPIキー（Stripe, OpenAI, Resend, AWS 等）の漏洩検知
  - クライアント環境変数（`NEXT_PUBLIC_`, `VITE_`）への秘密鍵混入検知
  - Supabase / PostgreSQL の Row Level Security (RLS) 未設定テーブル検知（複数マイグレーション解析・除外テーブル対応）
  - 認証ルートでのワイルドカード CORS 放置検知
- **実行ログの永続化**: すべての監査結果は `.shipguard/audit.log` に自動記録され、デプロイ履歴や過去の修正状況を追跡可能。
- **CI/CD Friendly**: GitHub Actions 等に組み込み、重大な違反がある場合は Exit Code 1 でデプロイを即座にブロック。

## インストール

```bash
# プロジェクトへの追加
npm install -D shipguard
# または yarn / pnpm / bun
bun add -d shipguard

# インストールなしで即座に実行
npx shipguard scan
```

## クイックスタート

### 1. 設定ファイルの生成（初回のみ）

```bash
npx shipguard init
```

プロジェクトルートに `.shipguardrc.json` が生成されます。

### 2. 監査スキャンの実行

```bash
npx shipguard scan
```

#### 実行オプション

```bash
npx shipguard scan --strict               # WARNING/LOWでも終了コード1を返す
npx shipguard scan --format markdown      # Markdown形式で標準出力
npx shipguard scan -o audit-report.md     # ファイルにレポートを保存
npx shipguard scan --format json          # 機械可読なJSON形式で出力
npx shipguard scan --ignore "test/**"     # 特定パスを除外
```

## 設定ファイル (`.shipguardrc.json`)

プロジェクト固有の要件に合わせてルールや除外設定をカスタマイズできます。

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
  }
}
```

## 監査ログの確認

`shipguard` は実行ごとに検証サマリーを保存します。

```bash
# 過去の監査ログサマリーを表示
npx shipguard history
```

ログファイル（`.shipguard/audit.log`）は NDJSON 形式で出力されるため、`jq` 等のツールで簡単にパース可能です。

```bash
cat .shipguard/audit.log | jq 'select(.passed == false)'
```

## CI/CD 統合（GitHub Actions）

デプロイパイプラインの直前に組み込むことで、設定漏れを含むコードのマージを防ぎます。

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
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx shipguard scan --strict
```

## ライセンス

MIT License