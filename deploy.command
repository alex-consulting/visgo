#!/bin/bash
# VISGOデプロイスクリプト - ダブルクリックで実行

cd "$(dirname "$0")"

# lockファイルがあれば削除
rm -f .git/*.lock .git/refs/heads/*.lock 2>/dev/null

# コミット&プッシュ
git add index.html
git commit -m "update: VISGO $(date '+%Y-%m-%d %H:%M')" 2>&1 || echo "変更なし"
git push origin main 2>&1 || git push --force origin HEAD:main 2>&1

echo ""
echo "✅ デプロイ完了！このウィンドウを閉じてください。"
read -p "Enterキーを押すと閉じます..."
