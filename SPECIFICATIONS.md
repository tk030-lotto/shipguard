# shipguard 詳細仕様書

## 1. システム構成と技術スタック

* **言語**: TypeScript (ESNext)
* **ランタイム**: Node.js (>=18.0.0) / Bun
* **主要ライブラリ**:
  * CLIフレームワーク: `commander`
  * ターミナルUI/スタイリング: `picocolors`, `@clack/prompts`
  * ファイル走査: `fast-glob`, `ignore`
  * 設定バリデーション: `zod`

## 2. ディレクトリ構成

```text
shipguard/
├── bin/
│   └── shipguard.js          # CLIエントリーポイント
├── src/
│   ├── commands/
│   │   ├── scan.ts           # メインスキャン実行ロジック
│   │   └── init.ts           # 設定ファイル生成
│   ├── rules/                # 監査ルール定義
│   │   ├── secrets.ts        # シークレットハードコード検知
│   │   ├── env.ts            # 環境変数検証
│   │   ├── supabase.ts       # Supabase/Postgres RLS検証
│   │   └── cors.ts           # CORS設定検証
│   ├── core/
│   │   ├── scanner.ts        # ファイル走査エンジン
│   │   ├── reporter.ts       # CLI / Markdown 出力
│   │   └── logger.ts         # 監査ログ永続化
│   ├── types/
│   │   └── index.ts
│   └── index.ts
├── package.json
└── tsconfig.json
```

## 3. 検知ルール定義仕様

| ルールID | 分類 | 重要度 | 検知ロジック・正規表現 |
| --- | --- | --- | --- |
| `SEC-001` | Secret | **CRITICAL** | Stripe Secret Key (`sk_live_[0-9a-zA-Z]{24,}`), OpenAI Key (`sk-[a-zA-Z0-9]{32,}`), GitHub PAT, AWS Access Key 等のハードコード |
| `SEC-002` | Env | **HIGH** | `NEXT_PUBLIC_`, `VITE_`, `PUBLIC_` プレフィックスに秘密情報名（`SECRET`, `PRIVATE`, `KEY`）が含まれている |
| `SEC-003` | Database | **HIGH** | `.sql` またはマイグレーションファイル内で `CREATE TABLE` 後に `ENABLE ROW LEVEL SECURITY` が記述されていない |
| `SEC-004` | Network | **MEDIUM** | APIルートやミドルウェア内で `Access-Control-Allow-Origin: *` が認証付きルートに適用されている |
| `CFG-001` | Env | **LOW** | `.env.example` に存在するキーがカレントの `.env` または `.env.local` に定義されていない |

## 4. ログ永続化仕様（`logger.ts`）

実行結果は必ずローカルディスクに保存し、監査履歴を追跡可能にする。

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
  }>;
}
```

## 5. 終了コード（Exit Codes）

* `0`: 違反なし（監査パス）
* `1`: CRITICAL または HIGH レベルの違反を検知（デプロイ停止対象）
* `2`: 実行時エラー（設定ファイル破損、権限エラー等）