# shipguard 詳細仕様書

## 1. システム構成と技術スタック

* **言語**: TypeScript (ESNext)
* **ランタイム**: Node.js (>=18.0.0) / Bun
* **主要ライブラリ**:
  * CLIフレームワーク: `commander`
  * ターミナルUI/スタイリング: `picocolors`, `@clack/prompts`
  * ファイル走査: `fast-glob`, `ignore`
  * 設定バリデーション: `zod`

## 2. アーキテクチャとパイプライン設計

監査処理は関心事の分離を徹底し、以下の多層パイプラインで実行します。

```text
[ファイル収集 / Scanner]
        ↓
[ルール判定 / Rule Engine]
        ↓
[例外・設定適用 / Config Filter]
        ↓
[重要度決定 / Severity Resolver]
        ↓
[結果出力 / Reporter & Logger]
```

1. **Scanner（走査）**: `.gitignore` およびデフォルト除外設定を適用し、対象ファイルを抽出。
2. **Rule Engine（検知）**: AST解析やパターンマッチングを用いて潜在的脆弱性・設定不備を抽出。
3. **Config Filter（例外・除外）**: プロジェクト設定（`.shipguardrc.json`）に基づき、除外パスや許容テーブルを除外。
4. **Severity Resolver（評価）**: 設定されたルールごとのSeverityレベル（critical, high, medium, low, off）を割り当て。
5. **Reporter & Logger（出力・記録）**: ターミナル表示、レポート生成、`.shipguard/audit.log` へのローカル永続化。

## 3. ディレクトリ構成

```text
shipguard/
├── bin/
│   └── shipguard.js              # CLIエントリーポイント
├── src/
│   ├── commands/                 # サブコマンド実装
│   │   ├── scan.ts               # scan コマンド
│   │   ├── init.ts               # init コマンド
│   │   └── history.ts            # history コマンド
│   ├── core/                     # コアエンジン
│   │   └── scanner.ts            # ファイル収集・gitignore適用
│   ├── rules/                    # 監査ルールエンジン
│   │   ├── secrets.ts            # ハードコードシークレット検知 (SEC-001)
│   │   ├── env.ts                # 環境変数プレフィックス・整合性検証 (SEC-002, CFG-001)
│   │   ├── database.ts           # RLS有効化検証 (SEC-003)
│   │   └── cors.ts               # CORS設定検証 (SEC-004)
│   ├── config/                   # 設定ファイルロード・検証
│   │   ├── loader.ts
│   │   └── schema.ts             # zodスキーマ定義
│   ├── reporter/                 # 結果レポーター
│   │   ├── terminal.ts           # ターミナル向けリッチ表示
│   │   ├── markdown.ts           # GitHub PR / CI用 Markdown出力
│   │   └── json.ts               # JSON形式出力
│   ├── logger/                   # 監査ログ永続化
│   │   └── index.ts              # .shipguard/audit.log (NDJSON)
│   ├── types/                    # 共通型定義
│   │   └── index.ts
│   └── index.ts
├── package.json
└── tsconfig.json
```

## 4. 検知ルール定義仕様

| ルールID | 分類 | デフォルト重要度 | 検知ロジック・仕様詳細 |
| --- | --- | --- | --- |
| `SEC-001` | Secret | **CRITICAL** | Stripe Secret Key (`sk_live_[0-9a-zA-Z]{24,}`), OpenAI Key (`sk-[a-zA-Z0-9]{32,}`), GitHub PAT, AWS Access Key 等のハードコード |
| `SEC-002` | Env | **HIGH** | `NEXT_PUBLIC_`, `VITE_`, `PUBLIC_` プレフィックスに秘密情報名（`SECRET`, `PRIVATE`, `KEY`）が含まれている |
| `SEC-003` | Database | **HIGH** | SQLマイグレーションファイル群全体を解析し、`CREATE TABLE` されたテーブル名に対して、同一または別ファイルで `ENABLE ROW LEVEL SECURITY` が適用されていないものを検知（設定による除外テーブル指定に対応） |
| `SEC-004` | Network | **MEDIUM** | APIルートやミドルウェア内で `Access-Control-Allow-Origin: *` が認証付きルートに適用されている |
| `CFG-001` | Env | **LOW** | `.env.example` に存在するキーがカレントの `.env` または `.env.local` に定義されていない |

### `SEC-003` (RLS検知) の誤検知防止仕様

* 単一ファイル完結の正規表現ではなく、プロジェクト内の全マイグレーションSQLファイル（`supabase/migrations/*.sql`, `prisma/migrations/**/*.sql` 等）を対象に、テーブル定義とRLS有効化文を突合します。
* `.shipguardrc.json` の `database.excludeTables` に指定されたテーブル（例: 誰でも閲覧可能な静的マスタやログ用テーブル等）は検知対象外とします。

## 5. 設定ファイル仕様 (`.shipguardrc.json`)

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
  "database": {
    "migrationsDir": "supabase/migrations",
    "excludeTables": ["spatial_ref_sys", "audit_events"]
  },
  "logging": {
    "enabled": true,
    "path": ".shipguard/audit.log"
  }
}
```

## 6. ログ永続化仕様 (`.shipguard/audit.log`)

* **保存先パス**: `.shipguard/audit.log`
* **フォーマット**: 1行1レコードのNDJSON（Newline Delimited JSON）
* **スキーマ定義**:

```typescript
interface AuditLogRecord {
  id: string;              // UUIDv4
  timestamp: string;       // ISO8601 UTC
  gitCommitHash?: string;  // 検証時のGitコミットハッシュ（取得可能な場合）
  summary: {
    scannedFiles: number;
    totalViolations: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  passed: boolean;
  violations: Array<{
    ruleId: string;
    filePath: string;
    line: number;
    message: string;
    severity: "critical" | "high" | "medium" | "low";
  }>;
}
```

## 7. 終了コード（Exit Codes）

* `0`: 違反なし（監査パス、または許容レベルの警告のみ）
* `1`: CRITICAL または HIGH レベルの違反を検知（デプロイ停止対象。`--strict` 指定時は MEDIUM / LOW も対象）
* `2`: 実行時エラー（設定ファイル構文エラー、アクセス権限エラー等）

## 8. フェーズ別実装計画

* **Phase 1: コア最小構成の稼働**
  * `package.json`, `tsconfig.json` の整備
  * `src/types/index.ts`（共通型定義）
  * `src/core/scanner.ts`（ファイル収集・gitignore適用）
  * `src/rules/secrets.ts`（SEC-001: シークレット検知）
  * `src/commands/scan.ts` および `bin/shipguard.js`（CLI実行と終了コード制御）
* **Phase 2: ルール拡充とログ永続化**
  * `src/rules/env.ts`（SEC-002, CFG-001）
  * `src/rules/database.ts`（SEC-003: 多層マイグレーション解析・除外テーブル対応）
  * `src/rules/cors.ts`（SEC-004）
  * `src/logger/index.ts`（NDJSON監査ログ記録）
* **Phase 3: レポーター・補助コマンド・CI統合**
  * `src/reporter/`（Markdown, JSON レポーター）
  * `src/commands/init.ts`（設定ファイル対話的生成）
  * `src/commands/history.ts`（過去ログ要約表示）
  * GitHub Actions 連携テスト