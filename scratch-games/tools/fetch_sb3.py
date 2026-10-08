#!/usr/bin/env python3
"""把一個「已分享」的 Scratch 專案打包成 .sb3（只用標準函式庫）。

用法：python3 fetch_sb3.py <project_id> <output.sb3>

.sb3 就是一個 zip：project.json + 所有造型／聲音素材（以 md5ext 命名）。
"""
import json
import sys
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor

API = "https://api.scratch.mit.edu/projects/{id}"
PROJECT = "https://projects.scratch.mit.edu/{id}?token={token}"
ASSET = "https://assets.scratch.mit.edu/internalapi/asset/{md5ext}/get/"
HEADERS = {"User-Agent": "nihongo-quest-fetch/1.0"}


def get(url: str) -> bytes:
    last = None
    for _ in range(4):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=60) as res:
                return res.read()
        except Exception as exc:  # 網路偶發錯誤：重試
            last = exc
    raise RuntimeError(f"下載失敗 {url}: {last}")


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    project_id, out = sys.argv[1], sys.argv[2]
    meta = json.loads(get(API.format(id=project_id)))
    token = meta.get("project_token")
    if not token:
        sys.exit("取不到 project_token：專案可能未分享。")
    raw = get(PROJECT.format(id=project_id, token=token))
    project = json.loads(raw)

    assets = sorted(
        {a["md5ext"] for t in project["targets"] for a in t["costumes"] + t["sounds"]}
    )
    print(f"{meta['title']}: {len(project['targets'])} targets, {len(assets)} assets")
    with ThreadPoolExecutor(8) as pool:
        blobs = list(pool.map(lambda m: get(ASSET.format(md5ext=m)), assets))

    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("project.json", raw)
        for name, blob in zip(assets, blobs):
            z.writestr(name, blob)
    print(f"wrote {out} ({sum(map(len, blobs)) / 1e6:.1f} MB of assets)")


if __name__ == "__main__":
    main()
