# shipguard 詳細仕様書

## 1. システム構成と技術スタック

* **言語**: TypeScript (ESNext)
* **ランタイム**: Node.js (>=18.0.0)
* **ビルド・配布**: `tsup` により実行時依存（`commander`, `ignore`, `picocolors`, `zod`）をすべて `dist/` にバンドルし、リリース zip 展開後に `npm install` なしで単体実行可能。
* **主要ライブラリ**:
  * CLIフレームワーク: `commander`
  * ターミナルUI/スタイリング: `picocolors`
  * `.gitignore` / Glob除外判定: `ignore`（ディレクトリ走査は `node:fs/promises`）
  * 設定バリデーション: `zod`

## 2. アーキテクチャとパイプライン設計

監査処理は以下のパイプラインで実行します。

```text
[ファイル収集 / Scanner]
        ↓
[ルール判定・設定/重要度解決 / Rule Engine]
        ↓
[結果出力 / Reporter & Logger]
```

1. **Scanner（走査）**: `DEFAULT_IGNORE`、ユーザー指定 `ignore`、および `.gitignore` を適用して対象ファイルを収集します。ただし `.env` および `.env.*` ファイルは `.gitignore` に記載されていても収集対象とします（自動除外ディレクトリ配下およびユーザー明示 `ignore` は除く）。対象不在・ルート `readdir` 失敗・走査対象 0 件時はエラー送出します。
2. **Rule Engine（検知・重要度解決）**: `src/rules/index.ts`（`executeRules`）が各ルールの実行と設定（`.shipguardrc.json` の `rules` による `off` / Severity 上書き、および `Rule.defaultSeverity`・`Rule.name` の適用）を一括で担います。
3. **Reporter & Logger（出力・記録）**: ターミナル表示、レポート生成（JSON / Markdown / HTML）、`.shipguard/audit.log` へのローカル永続化。

## 3. ディレクトリ構成

```text
shipguard/
├── bin/
│   └── shipguard.js              # CLIエントリーポイント
├── src/
│   ├── commands/                 # サブコマンド実装
│   │   ├── scan.ts               # scan コマンド
│   │   ├── init.ts               # init コマンド
│   │   ├── history.ts            # history コマンド
│   │   ├── ui.ts                 # ローカル Web UI HTTPサーバー
│   │   └── ui-html.ts            # Web UI ダッシュボードHTML生成
│   ├── core/                     # コアエンジン
│   │   └── scanner.ts            # ファイル収集・gitignore適用
│   ├── rules/                    # 監査ルールエンジン
│   │   ├── index.ts              # ルール統合実行・Severity/メタデータ解決
│   │   ├── secrets.ts            # ハードコードシークレット検知 (SEC-001)
│   │   ├── env.ts                # 環境変数プレフィックス・整合性検証 (SEC-002, CFG-001)
│   │   ├── database.ts           # RLS有効化検証 (SEC-003)
│   │   └── cors.ts               # CORS設定検証 (SEC-004)
│   ├── config/                   # 設定ファイルロード・検証
│   │   ├── loader.ts
│   │   └── schema.ts             # zodスキーマ定義 (.strict)
│   ├── reporter/                 # 結果レポーター
│   │   ├── index.ts              # 出力ディスパッチャ・フォーマット/拡張子検証
│   │   ├── terminal.ts           # ターミナル向け表示
│   │   ├── markdown.ts           # GitHub PR / CI用 Markdown出力
│   │   ├── json.ts               # JSON形式出力
│   │   └── html.ts               # スタンドアロン HTMLレポート出力
│   ├── logger/                   # 監査ログ永続化
│   │   └── index.ts              # .shipguard/audit.log (NDJSON)・実パス境界検証
│   ├── utils/                    # ユーティリティ
│   │   ├── dialog.ts             # OS標準フォルダ/ファイル選択ダイアログ
│   │   └── open.ts               # 既定ブラウザ起動
│   ├── types/                    # 共通型定義
│   │   └── index.ts
│   └── index.ts
├── test/                         # 自動テスト群 (Vitest)
├── package.json
└── tsconfig.json
```

## 4. 検知ルール定義仕様

| ルールID | 分類 | デフォルト重要度 | 検知ロジック・仕様詳細 |
| --- | --- | --- | --- |
| `SEC-001` | Secret | **CRITICAL** | Stripe Secret Key (`sk_live_[0-9a-zA-Z]{24,}`), OpenAI Key (`sk-[a-zA-Z0-9_-]{32,}`), GitHub PAT, AWS Access Key 等のハードコードおよび文字列連結・テンプレートリテラル・配列 `join("")` による組み立て式を検知。実 env ファイル（`.env` 等）は対象外、`.env.example`/`.sample`/`.template` の非プレースホルダーは対象。 |
| `SEC-002` | Env | **HIGH** | `NEXT_PUBLIC_`, `VITE_`, `PUBLIC_`, `NUXT_PUBLIC_`, `EXPO_PUBLIC_` プレフィックスに秘密情報名（強危険語: `SECRET`, `PRIVATE`, `PASSWORD`, `PASSWD`, `SERVICE_ROLE`, `ADMIN_KEY`, `DATABASE_URL`, `DB_PASS`, `TOKEN`, `API_KEY`／汎用: `KEY`）が含まれる変数を検知。強危険語を安全語（`ANON`, `PUBLISHABLE`, `PUBLIC_KEY`）より先に評価。`.env` 系ファイルではコメント行を除外し行頭代入形式（`NAME=value`）のみ対象。`.env.example` / `.env.sample` / `.env.template` は除外。 |
| `SEC-003` | Database | **HIGH** | `database.migrationsDir` 配下の SQL ファイル群からコメント（`--` / `/* ... */`）を行番号維持で除去した上で、`CREATE TABLE`（複数行・CTAS `AS SELECT`・引用符識別子含む）と `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` を突合。`database.excludeTables` に対応。対象 SQL が 0 件の場合は終了コードを変えず注記を出力。 |
| `SEC-004` | Network | **MEDIUM** | 対象拡張子（`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.json`）内のコメント除去後テキストから `Access-Control-Allow-Origin: *`（オブジェクトリテラル、`setHeader` / `set` / `header` / `append` の複数行含む）、`origin: "*"` / `origin: true`、`cors("*")` を検知。 |
| `CFG-001` | Env | **LOW** | `.env.example` / `.env.template` に存在するキーがローカルの `.env` または `.env.local` に定義されていない。 |

### 静的解析の限界とマスク範囲（`SEC-001`）

* **静的解析の限界**: 外部 API・環境・複雑な制御構文や関数呼び出しを通じて動的に組み立てられる値は、静的解析ではすべてを追跡できません。
* **マスク対象範囲**: `snippet` の既定マスク（`--show-secrets` 未指定時）は、`SEC-001` が検知・マッチした文字列または組み立て式部分のみを置換します。同一行内に別の秘密や別パラメータが存在する場合は `snippet` に残りうるため、レポート共有時は出力内容を確認してください（`.shipguard/audit.log` には `snippet` を保存しません）。

### `SEC-003` (RLS検知) の誤検知防止仕様

* 単一ファイル完結の正規表現ではなく、`database.migrationsDir`（既定: `supabase/migrations`）配下の全マイグレーションSQLファイルを対象に、コメント除去後のテーブル定義（複数行・CTAS・引用符識別子含む）とRLS有効化文を突合します。
* `.shipguardrc.json` の `database.excludeTables` に指定されたテーブル（例: 誰でも閲覧可能な静的マスタやログ用テーブル等）は検知対象外とします。
* 対象ディレクトリ配下の `.sql` が 0 件で `SEC-003` が無効化されていない場合、結果に未実施の注記を含めます。

## 5. 設定ファイル仕様 (`.shipguardrc.json`)

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
    "excludeTables": ["spatial_ref_sys", "audit_events"]
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

* スキーマは strict 検証され、JSON 構文エラー・未知キー・`rules` 内の未知ルール ID・不正値がある場合は設定エラーとして終了コード `2` で停止します。
* `logging.path` は字句上および実パス（`realpath`）上の両方で対象ディレクトリ（`rootDir`）の内部に収まる必要があります（シンボリックリンク / ジャンクション経由の逸脱を拒否）。

## 6. ログ永続化仕様 (`.shipguard/audit.log`)

* **保存先パス**: `.shipguard/audit.log`（`logging.path` で変更可。単一ファイルスキャン時は親ディレクトリ基準）
* **フォーマット**: 1行1レコードのNDJSON（Newline Delimited JSON）。破損行が含まれる場合はスキップ件数を呼び出し元へ返却し警告表示します。
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

## 7. 出力経路と終了コード（Exit Codes）

* `--open` オプションは `--format html` 指定時にのみ作用します（`json` / `markdown` 指定時に HTML 出力へ上書きしません）。
* `-o, --output` の拡張子（`.json` / `.md` / `.markdown` / `.html` / `.htm`）が `--format` と食い違う場合はエラー（終了コード `2`）になります。
* `0`: 違反なし（または `--strict` 未指定で `medium` / `low` のみ）
* `1`: CRITICAL または HIGH レベルの違反を検知（`--strict` 指定時は MEDIUM / LOW を含む全レベルが対象）
* `2`: 実行時・設定・引数エラー（未知オプション・不正数値・未知コマンド、設定ファイル構文/スキーマエラー・未知ルール ID、不明な `--format`、`-o` 拡張子不一致、走査対象 0 件、走査対象不在、アクセス権限エラー等）
