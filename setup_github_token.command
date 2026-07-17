#!/bin/bash
# クリップボードのトークンを使ってgit認証を設定するスクリプト
cd "$(dirname "$0")"

echo "================================================"
echo "  GitHub認証セットアップ（クリップボード版）"
echo "================================================"
echo ""
echo "手順:"
echo "  1. ブラウザのGitHubトークンページで 📋 コピーボタンをクリック済みか確認"
echo "  2. このままEnterを押す"
echo ""
read -p "トークンをコピーしたらEnterを押してください..."

# クリップボードからトークンを取得
GH_TOKEN=$(pbpaste)
GH_USER="alex-consulting"

if [[ ! "$GH_TOKEN" == ghp_* ]] && [[ ! "$GH_TOKEN" == github_pat_* ]]; then
  echo ""
  echo "⚠ クリップボードにトークンがありません（現在: ${GH_TOKEN:0:10}...）"
  echo "  GitHubのトークンページで 📋 コピーボタンを押してから再実行してください。"
  echo ""
  read -p "Enterキーを押すと閉じます..."
  exit 1
fi

echo "✅ クリップボードからトークンを取得しました（${GH_TOKEN:0:8}...）"
echo ""

# キーチェーンの古いエントリを全て削除
echo "古い認証情報を削除中..."
security delete-internet-password -s github.com 2>/dev/null
security delete-internet-password -s api.github.com 2>/dev/null
printf "protocol=https\nhost=github.com\n" | git credential reject 2>/dev/null

# 直接Remote URLにトークンを埋め込む（最も確実な方法）
git remote set-url origin "https://${GH_USER}:${GH_TOKEN}@github.com/alex-consulting/visgo.git"
echo "✅ Remote URLを更新しました"
echo ""

# push実行
echo "push中..."
git push origin main 2>&1
if [ $? -eq 0 ]; then
  echo ""
  echo "✅ push成功！"
  # 成功後はURLからトークンを除去してkeychainに保存
  git remote set-url origin "https://github.com/alex-consulting/visgo.git"
  git config --global credential.helper osxkeychain
  printf "protocol=https\nhost=github.com\nusername=%s\npassword=%s\n" "$GH_USER" "$GH_TOKEN" | git credential approve
  echo "✅ 認証情報をキーチェーンに保存しました。次回からdeploy.commandが使えます。"
else
  echo ""
  echo "⚠ push失敗。alex-consulting/visgoへの書き込み権限を確認してください。"
fi

echo ""
read -p "Enterキーを押すと閉じます..."
