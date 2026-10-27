# VISGO 引き継ぎメモ
最終更新: 2026-10-27

---

## アプリ概要

- **名称**: VISGO（原田式目標管理 PWA）
- **URL**: https://alex-consulting.github.io/visgo
- **構成**: 単一ファイル PWA（`index.html`）
- **クラウド同期**: `https://visgo-sync.moriyamakoto.workers.dev`（Cloudflare Worker）
- **同期データ保存先**: localStorage `haradaApp_v1`、画像は IndexedDB（IDB）

---

## フォルダ構成

```
VISGO/
├── index.html          ← アプリ本体（これだけ編集する）
├── deploy.command      ← ダブルクリックでGitHub Pagesにデプロイ
├── sw.js               ← Service Worker（ルート必須・移動不可）
├── favicon.ico         ← ルート必須・移動不可
├── apple-touch-icon.png ← ルート必須・移動不可
├── 画像/
│   ├── favicon-32.png
│   ├── favicon-192.png
│   ├── ogp.png
│   └── visgo-logo.png
└── システム/
    ├── worker.js       ← Cloudflare Worker本体
    ├── wrangler.toml   ← Cloudflare設定
    └── README.md
```

---

## 開発ルール

- **コード編集**: Claudeのサンドボックス（bash）で `index.html` を直接編集
- **テスト**: Claude in Chrome で動作確認
- **デプロイ**: Finder で `deploy.command` をダブルクリック
- **git操作**: サンドボックスから `git add / commit` は可能。`git push` は keychain 不可なので deploy.command 経由
- **lockファイル**: `.git/*.lock` は `os.rename()` で退避（`os.unlink()` は Google Drive マウント制限で不可）
- **bashパス**: `/sessions/friendly-stoic-ride/mnt/visgo/`（フォルダ名は大文字VISGOだがbashマウントは小文字のまま）

### Claudeへの作業指示
> できる作業はこちらにやらせない。Claude in chromeでテストして、修正が終わってからこちらに「完了した」と伝えること。Computer useはクラッシュしやすいので、複雑な処理は複数回に分けること。

---

## データ構造（主要）

```
D = {
  gtd: {
    tasks: [{id, text, status, project, done, created, updatedAt, ...}],
    nextId: Number,
    projects: [],
    deletedProjects: [],      // トゥームストーン
    projectRenames: {},       // リネーム記録
    deletedTaskIds: [],       // タスクトゥームストーン
    _deletedTaskAt: {}        // 削除タイムスタンプ（7日で自動削除）
  },
  dreams: {
    items: [{id, title, updatedAt, ...}],
    nextId: Number,
    deletedIds: [],           // トゥームストーン
    _deletedAt: {},
    mission: '', missionTitle: '',
    _missionUpdatedAt: Number,
    value: '', valueTitle: '',
    _valueUpdatedAt: Number
  },
  ow: {
    goal: '',
    themes: [8要素],
    actions: [8x8配列],
    _updatedAt: Number,
    _cellTs: {goal, themes:[8], actions:[8x8]}  // セル単位タイムスタンプ
  },
  _syncAt: Number             // 同期タイムスタンプ
}
```

---

## 同期の仕組み

### 競合解決（新しいデータが必ず勝つ）

| データ | 解決単位 |
|--------|---------|
| GTDタスク | タスクID単位で updatedAt 比較 |
| プロジェクト削除 | deletedProjects トゥームストーン |
| 夢リスト項目 | 項目ID単位で updatedAt 比較 |
| 夢削除 | deletedIds トゥームストーン |
| ミッション・バリュー | _missionUpdatedAt / _valueUpdatedAt 比較 |
| OW64 | セル単位（_cellTs）で比較 |

### トゥームストーン自動削除
- 削除から7日経過したエントリを同期成功時に自動削除
- D.gtd._deletedTaskAt[id] / D.dreams._deletedAt[id] にタイムスタンプ記録

### プッシュ失敗時
- D._pendingPush = true にセット → 30秒後に自動リトライ

---

## 最近の修正履歴（2026-10）

| コミット | 内容 |
|---------|------|
| 5ddcd3c | サブタスク2回目ドラッグが効かない問題修正 |
| fef4140 | ファイル整理（画像/ システム/ フォルダ） |
| 3fc85aa | Googleカレンダートークン自動更新（1時間で切れる問題修正） |
| ca78623 | ミッション画像削除がIDBに反映されない問題修正 |
| a7e909b | OW64セル単位競合解決・夢削除showConfirm・トゥームストーン |
| 804eadc | 夢リスト・OW64の競合解決 |
| 5ac043e | タスク updatedAt 競合解決・削除トゥームストーン |
| 9922623 | プロジェクト削除・リネームのsync後復活問題修正 |
| 6a18c7a | タスク削除を confirm() → showConfirm() カスタムモーダルに変更 |

---

## 既知の制約

- 画像はIDB管理。`save()` の条件 `length > 0` に注意（空配列は別途 `idbSet` が必要）
- Google OAuth トークンは1時間期限 → `gcalSilentRefresh()` で自動更新済み
- `sw.js` / `favicon.ico` / `apple-touch-icon.png` はルート必須（移動不可）
