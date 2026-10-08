#!/bin/sh
# 由原始 .sb3 產生修改版：套用 patch_project.mjs，並壓縮點陣圖讓下載變小。
# 需要 node、unzip、zip、pngquant；最簡單的方式是在容器裡跑（在 repo 根目錄執行）：
#
#   docker run --rm -v "$PWD/scratch-games:/work" -w /work node:20-alpine \
#     sh -c "apk add --no-cache zip unzip pngquant >/dev/null && sh tools/build_patched.sh"
set -eu

SRC=original/yuanze-knight-v1.2.sb3
OUT=patched/yuanze-knight-v1.4.sb3
TMP=$(mktemp -d)

unzip -q "$SRC" -d "$TMP"
node tools/patch_project.mjs "$TMP"

# 檔名（素材的 md5）維持不變，project.json 才找得到；pngquant 壓不小的檔案會原樣保留
before=$(du -sk "$TMP" | cut -f1)
find "$TMP" -name '*.png' -exec pngquant --quality 70-95 --skip-if-larger --strip --ext .png --force {} + || true
after=$(du -sk "$TMP" | cut -f1)

mkdir -p patched
rm -f patched/*.sb3
(cd "$TMP" && zip -q -9 -r out.sb3 . -x out.sb3)
mv "$TMP/out.sb3" "$OUT"
rm -rf "$TMP"
echo "素材：${before} KB → ${after} KB；輸出 $OUT（$(du -k "$OUT" | cut -f1) KB）"
