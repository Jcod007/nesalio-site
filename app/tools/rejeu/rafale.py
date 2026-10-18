#!/usr/bin/env python3
"""Rejoue une séance et prend une rafale de captures pendant les phrases qui contiennent un mot donné (pour voir un mouvement)."""
import json, sys
from playwright.sync_api import sync_playwright

S, path, tag, needle = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
turns = json.load(open(path))
def handle(route):
    route.fulfill(status=200, headers={"Content-Type": "application/x-ndjson"},
                  body="\n".join(json.dumps(e, ensure_ascii=False) for e in turns[0]) + "\n")
n = 0
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    pg = b.new_page(viewport={"width": 1280, "height": 760})
    pg.route("**/api/tutor", handle)
    pg.route("**/api/voice", lambda r: r.fulfill(status=503, body="{}"))
    pg.goto("http://localhost:3100/")
    pg.wait_for_timeout(1500)
    pg.get_by_role("button", name="Couper la voix de Nesa").click()
    pg.get_by_role("textbox").first.fill("gestes")
    pg.keyboard.press("Enter")
    last = ""
    for i in range(300):
        pg.wait_for_timeout(200)
        cap = pg.locator("section[aria-label=Nesa] [class*=caption]").first
        text = cap.inner_text().strip() if cap.count() else ""
        if text != last:
            last = text
            if needle in text:
                for k in range(int(sys.argv[5]) if len(sys.argv) > 5 else 10):
                    n += 1
                    pg.screenshot(path=f"{S}/{tag}-{n:02d}.png", clip={"x": 300, "y": 90, "width": 680, "height": 460})
                    pg.wait_for_timeout(350)
        if pg.get_by_text("Séance terminée").count() > 0:
            break
    print(n, "captures")
    b.close()
