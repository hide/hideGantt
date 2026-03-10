# Gantt App

ブラウザで動作するガントチャートアプリケーション。サーバー不要で、データは localStorage に保存されます。

## 機能

- **ガントチャート表示** - タスクをタイムライン上にバーで表示。ドラッグで開始日・終了日を変更可能
- **ダッシュボード表示** - プロジェクト全体の進捗をサマリー表示
- **プロジェクト管理** - 複数プロジェクトの作成・切り替え
- **タスク管理** - タスクの作成・編集・削除、親子関係、依存関係
- **サブタスク** - タスク内にサブタスクを作成。完了数に応じて進捗を自動計算
- **メンバー管理** - メンバーをタスク・サブタスクに割り当て
- **カテゴリ** - タスクに複数カテゴリを設定可能
- **マイルストーン** - 期限をマイルストーンとして管理
- **グループ表示** - プロジェクト / メンバー / カテゴリ / マイルストーン別にタスクをグルーピング表示
- **ドラッグ＆ドロップ** - タスク・グループの並び替え
- **自動フィット** - 日付範囲全体が画面幅に収まるよう自動でスケール調整
- **テーマ** - 複数のダークテーマを切り替え可能
- **多言語対応** - 日本語 / English
- **データ入出力** - JSON 形式でエクスポート・インポート
- **スナップショット共有** - 現在の状態を URL で共有（読み取り専用）

## 技術スタック

- React 19 + TypeScript
- Vite
- Tailwind CSS 4
- localStorage（データ永続化）
- lz-string（共有 URL の圧縮）
- uuid（ID 生成）

## セットアップ

```bash
npm install
npm run dev
```

## ビルド

```bash
npm run build
npm run preview
```

## プロジェクト構成

```
src/
  App.tsx              - アプリケーションルート
  types.ts             - 型定義（Task, Project, Person, Category, Milestone 等）
  store.ts             - 状態管理・CRUD 操作・localStorage 永続化
  i18n.ts              - 多言語対応（日本語 / English）
  theme.ts             - テーマ定義
  sharing.ts           - スナップショット共有（URL エンコード・デコード）
  ThemeContext.tsx      - テーマ Context
  LangContext.tsx       - 言語 Context
  components/
    MenuBar.tsx         - 階層メニュー（表示・テーマ・言語・データ操作）
    GanttChart.tsx      - ガントチャート本体（タスク一覧 + SVG タイムライン）
    TaskDetailPanel.tsx - タスク詳細・編集パネル
    ItemEditPanel.tsx   - プロジェクト・メンバー等の編集パネル
    Dashboard.tsx       - ダッシュボード表示
```
