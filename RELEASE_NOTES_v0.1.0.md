# shipguard v0.1.0

個人開発者のための事前ローンチ・セキュリティ＆設定監査CLI `shipguard` の初回リリースです。

## 主な機能

- **静的解析セキュリティ監査**:
  - **SEC-001**: ハードコードされた秘密鍵・APIトークン（Stripe, OpenAI, Resend, AWS 等）の検出
  - **SEC-002**: 公開用クライアント環境変数（`NEXT_PUBLIC_`, `VITE_` 等）への秘密鍵混入検出
  - **SEC-003**: Supabase / PostgreSQL の Row Level Security (RLS) 未設定テーブル検出
  - **SEC-004**: 認証系ルート等におけるワイルドカード CORS (`*`) の放置検出
  - **CFG-001**: `.env.example` と実際の `.env` との不整合検出
- **多形式レポート出力**:
  - ターミナル表示（Summary / Detailed）
  - JSON形式 (`.shipguard/audit.json`)
  - Markdown形式 (`.shipguard/audit.md`)
  - HTML形式 (`.shipguard/audit.html`)
- **監査ログの永続化**:
  - すべてのスキャン結果を `.shipguard/audit.log` (NDJSON) に自動記録
- **ローカルWeb UI**:
  - `shipguard ui` コマンドまたは Windowsバッチ `shipguard-ui.bat` でブラウザから直感的に操作可能
  - フォルダ・ファイル選択ダイアログ対応
  - 過去の監査ログ履歴の閲覧
- **CI/CD連携**:
  - 重大（HIGH / CRITICAL）な違反検出時に Exit Code 1 を返し、デプロイやマージを自動遮断

## 利用方法

### npx から実行（Node.js >= 18）
```bash
# プロジェクト初期化
npx shipguard init

# 監査スキャンの実行
npx shipguard scan

# Web UIの起動
npx shipguard ui
```

### 配布パッケージ（zip）から利用
添付の `shipguard-v0.1.0.zip` を展開し、以下のように実行できます。

- **CLI実行**: `node bin/shipguard.js scan`
- **Windows UIワンクリック起動**: `shipguard-ui.bat` をダブルクリック
