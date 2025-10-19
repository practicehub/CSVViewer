# CSV Viewer

[English](README.en.md) | 日本語 | [简体中文](README.md)

React + Expressベースの百万行CSVデータビューアシステム、オフラインイントラネット展開対応。

## 🎯 機能

### コア機能
- ✅ **ユーザー認証** - JWTトークンセキュリティ
- ✅ **CSVファイルアップロード** - 100MB以上の大容量ファイル対応
- ✅ **百万行データ処理** - Papa Parse正確な解析、JSON保存で全内容を保持
- ✅ **サーバーサイドページネーション** - 50/100/200/500行選択可能、秒レベルの応答
- ✅ **高度なフィルタリング**
  - 時間範囲フィルタ（秒精度）
  - キーワード検索
  - 列選択フィルタ
- ✅ **バッチ操作** - ファイル選択と一括削除
- ✅ **詳細表示** - 行をクリックして完全な詳細を表示、複数行コンテンツ完全対応
- ✅ **タイムゾーン変換** - UTCから自動的にローカルタイムゾーンへ変換

### 技術的ハイライト
- 📦 npm workspaces モノレポ管理
- 🚀 Papa Parse RFC 4180標準CSV解析
- 💾 SQLiteデータベース、JSON形式保存（すべての改行を保持）
- 🔒 旧データ形式との下位互換性
- 🌐 完全なオフライン展開サポート

## 📋 技術スタック

### フロントエンド
- React 18 + TypeScript
- Material-UI (MUI)
- Vite
- React Router v6
- Axios

### バックエンド
- Node.js + Express
- TypeScript
- SQLite3 (better-sqlite3)
- JWT認証
- Papa Parse
- Multer（ファイルアップロード）

## 🚀 クイックスタート

### システム要件
- Node.js >= 16.x
- npm >= 8.x

### 開発環境

#### 1. 依存関係のインストール
```bash
npm install
```

#### 2. 開発サーバーの起動
```bash
# フロントエンドとバックエンドを同時に起動
npm run dev

# または個別に起動
cd client && npm run dev  # http://localhost:5173
cd server && npm run dev  # http://localhost:4000
```

### 本番環境

#### 1. プロジェクトのビルド
```bash
# 自動ビルドスクリプト（推奨）
# Windows
.\build-for-deploy.bat

# Linux/Mac
chmod +x build-for-deploy.sh
./build-for-deploy.sh
```

または手動ビルド：
```bash
npm run build
```

#### 2. サービスの起動
```bash
# Windows
.\start.bat

# Linux/Mac
chmod +x start.sh
./start.sh
```

#### 3. アプリケーションへのアクセス

**ローカルアクセス**：
```
http://localhost:4000
```

**LANアクセス**（同じネットワーク上の他のデバイス）：
```
http://<your-ip>:4000
例：http://192.168.31.65:4000
```

> 💡 起動スクリプトは利用可能なアクセスアドレスとローカルIPを自動表示します

## 📖 APIドキュメント

### 認証API
- `POST /api/auth/register` - ユーザー登録
- `POST /api/auth/login` - ユーザーログイン
- `GET /api/auth/profile` - ユーザー情報取得

### CSV API
- `POST /api/csv/upload` - CSVファイルアップロード
- `GET /api/csv/list` - ファイルリスト取得
- `GET /api/csv/:id` - ファイルデータ取得（ページネーション付き）
- `GET /api/csv/:id/row/:rowNumber` - 単一行詳細取得
- `DELETE /api/csv/:id` - 単一ファイル削除
- `POST /api/csv/batch-delete` - 一括ファイル削除

## 🐛 トラブルシューティング

### ポートが既に使用中
```bash
# server/.envのPORTを変更
PORT=5000
```

### ビルド失敗
```bash
# クリーンして再インストール
rm -rf node_modules package-lock.json
npm install
npm run build
```

### 起動失敗
```bash
# ビルド成果物を確認
ls server/dist/index.js
ls client/dist/index.html

# 存在しない場合は再ビルド
npm run build
```

## 📄 ライセンス

GNU General Public License v3.0

このプロジェクトはGPL-3.0オープンソースライセンスの下でライセンスされています。詳細は[LICENSE](LICENSE)をご覧ください。

## 🙋 サポート

問題が発生しましたか？
1. [DEPLOYMENT-OFFLINE.md](DEPLOYMENT-OFFLINE.md)を確認
2. トラブルシューティングセクションを確認
3. Issueを提出

---

**プロジェクト完成度**: 100% ✅

**主な機能**:
- ✅ 百万行PODログ処理
- ✅ 完全なユーザー認証システム
- ✅ 高度なフィルタリングと検索
- ✅ バッチファイル管理
- ✅ 詳細表示（複数行サポート）
- ✅ タイムゾーン自動変換
- ✅ 完全なオフライン展開ソリューション
