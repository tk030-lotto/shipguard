# shipguard

> 個人開発者のための事前ローンチ・セキュリティ＆設定監査CLI。
> サーバー不要・維持費0円・オフライン完結で、デプロイ直前の致命的な事故を防ぎます。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/badge/npm-v1.0.0-orange.svg)]()

---

## なぜ shipguard なのか？

個人開発者が本番公開を躊躇する最大の理由は「見落としへの不安」です。
- `.env` に入れたはずの Stripe の秘密鍵がフロントエンドに混ざっていないか？
- Supabase の RLS を有効化し忘れて、テーブルが全開放されていないか？
- 開発用の `CORS: *` がそのまま本番に残っていないか？

`shipguard` はリポジトリを数秒で静的解析し、ローンチを妨げる設定不備やセキュリティホールを洗い出します。外部通信は一切行わず、維持コスト・保守コストはゼロです。

## 主な特徴

- **完全スタンドアロン & 維持費0円**: APIサーバーや外部SaaSへの依存ゼロ。ローカルまたはCI上で高速実行。
- **個人開発特化の監査ルール**:
  - ハードコードされたAPIキー（Stripe, OpenAI, Resend, AWS 等）の漏洩検知
  - クライアント環境変数（`NEXT_PUBLIC_`, `VITE_`）への秘密鍵混入検知
  - Supabase / PostgreSQL の Row Level Security (RLS) 未設定テーブル検知
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
npx shipguard scan --strict         # WARNINGでも終了コード1を返す
npx shipguard scan --format markdown # audit-report.md を出力
npx shipguard scan --ignore "test/**" # 特定パスを除外
```

## 設定ファイル (`.shipguardrc.json`)

プロジェクト固有の要件に合わせてルールをカスタマイズできます。

```json
{
  "$schema": "https://raw.githubusercontent.com/your-username/shipguard/main/schema.json",
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