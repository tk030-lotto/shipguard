# shipguard v0.1.1

`shipguard` のメンテナンスリリース v0.1.1 です。配布パッケージの単体実行対応、`.env` ファイルの扱い、各監査ルールの検知精度、ローカル Web UI の保護、および終了コードの一貫性を改善しました。

## 主な変更点

- **配布 zip の単体実行対応**:
  - 実行時依存をビルド済みバンドルに同梱したため、`shipguard-v0.1.1.zip` を展開した環境で `npm install` を行わずに `node bin/shipguard.js` を実行できるようになりました。
- **`.env` ファイルの検査と秘密情報マスキング**:
  - `.gitignore` に `.env` / `.env.*` が含まれているプロジェクトでも、環境変数ファイルを検査対象として収集し、`SEC-002`（公開プレフィックス検査）と `CFG-001`（テンプレート差分検査）が正常に動作するようにしました。
  - `.env` / `.env.local` 等の実環境変数ファイルは `SEC-001`（ハードコード検知）の対象から除外し、`.env.example` / `.env.sample` / `.env.template` は `SEC-002` の対象から除外しました。
  - `SEC-001` のスニペットは既定でマッチ箇所をマスクし（`--show-secrets` 指定時のみ原文表示）、`SEC-002` で `.env` 行を検知した場合も代入値をマスク表示（`VAR_NAME=********`）して各出力形式および UI に平文が残らないようにしました。
- **監査ルールの検知精度向上**:
  - **SEC-001**: 文字列連結・テンプレートリテラル・配列 `join("")` によるシークレット組み立て式の検知を追加しました。
  - **SEC-002**: 危険キーワードの判定を安全語より先に評価し、`TOKEN` / `API_KEY` / `KEY` を追加、`.env` ファイルの `export NAME=value` 形式に対応しました（コメント行および非代入行は除外）。
  - **SEC-003**: ブロックコメントと行末コメントを除去した上で、複数行 `CREATE TABLE`、CTAS（`CREATE TABLE ... AS SELECT`）、引用符付き識別子（`"public"."table"`）に対応し、`database.migrationsDir` 設定を走査範囲に反映しました。対象 SQL が 0 件の場合は終了コードを変えず注記を表示します。
  - **SEC-004**: `res.set(...)`、複数行 `setHeader`、`origin: true` の検知に対応しました。
- **CLI 終了コード・出力オプション・Web UI の改善**:
  - 不正な引数・未知オプション・未知コマンド・設定ファイルの構文/スキーマエラー（未知ルール ID 含む）・`-o` 拡張子と形式の不一致・走査対象ファイル 0 件をすべて終了コード `2` に統一しました。
  - `--open` オプションは `--format html` 指定時にのみ作用するよう整理しました。
  - ローカル Web UI を `127.0.0.1` 固定バインド、`Host` / `Origin` 検証、並行スキャン抑止、単一ファイルスキャン対応、HTML エスケープ（XSS 対策）、および Google Fonts 除去によるオフライン完結へ更新しました。
  - 監査ログ出力先（`logging.path`）に対して実パス（`realpath`）を含む境界チェックを導入しました。

## 利用方法（配布パッケージ zip から利用）

必要環境: Node.js >= 18.0.0（展開先での `npm install` は不要です）。

添付の `shipguard-v0.1.1.zip` を展開し、対象プロジェクトのディレクトリで以下のように実行します。

```bash
# 設定ファイルの生成（初回のみ）
node /path/to/shipguard/bin/shipguard.js init

# 監査スキャンの実行
node /path/to/shipguard/bin/shipguard.js scan

# HTML レポートを生成してブラウザで開く (.shipguard/report.html)
node /path/to/shipguard/bin/shipguard.js scan --format html --open

# 全レベルの違反で停止
node /path/to/shipguard/bin/shipguard.js scan --strict

# 監査履歴の確認
node /path/to/shipguard/bin/shipguard.js history

# ローカル Web UI の起動
node /path/to/shipguard/bin/shipguard.js ui
```

- **Windows UI ワンクリック起動**: 展開フォルダ直下の `shipguard-ui.bat` をダブルクリックします（「発行元を確認できませんでした」という警告が表示される場合は「実行」を押してください。ファイルのプロパティで「ブロックの解除」を行うと表示されなくなります）。
