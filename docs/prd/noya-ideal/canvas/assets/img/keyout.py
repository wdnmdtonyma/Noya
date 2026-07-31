#!/usr/bin/env python3
"""抠掉 codex 生成小人的白底：边缘泛洪去白 → 按 alpha 裁剪 → 缩到 512 高。
用法: python3 keyout.py s-*.png  （已处理过的自动跳过）"""
import sys
from collections import deque
from PIL import Image

THRESH = 232  # 近白判定


def key_one(path):
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    px = im.load()
    # 已经有大片透明说明处理过/本来就是透明底
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    if all(c[3] == 0 for c in corners):
        print(f"skip(已透明) {path}")
        return
    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        q.append((x, 0)); q.append((x, h - 1))
    for y in range(h):
        q.append((0, y)); q.append((w - 1, y))
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h:
            continue
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        r, g, b, a = px[x, y]
        if r >= THRESH and g >= THRESH and b >= THRESH:
            px[x, y] = (r, g, b, 0)
            q.append((x + 1, y)); q.append((x - 1, y))
            q.append((x, y + 1)); q.append((x, y - 1))
    # 边缘羽化一圈：紧邻透明的亮像素降 alpha，压白边
    alpha = im.getchannel("A").load()
    fringe = []
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            if alpha[x, y] == 0:
                continue
            if (alpha[x + 1, y] == 0 or alpha[x - 1, y] == 0
                    or alpha[x, y + 1] == 0 or alpha[x, y - 1] == 0):
                r, g, b, a = px[x, y]
                if r > 200 and g > 200 and b > 200:
                    fringe.append((x, y, r, g, b))
    for x, y, r, g, b in fringe:
        px[x, y] = (r, g, b, 120)
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    if im.height > 512:
        im = im.resize((round(im.width * 512 / im.height), 512), Image.LANCZOS)
    im.save(path)
    print(f"keyed {path} -> {im.size}")


for p in sys.argv[1:]:
    try:
        key_one(p)
    except Exception as e:
        print(f"fail {p}: {e}")
