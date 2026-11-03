#!/usr/bin/env python3
"""Rejoue une séance complète (plusieurs tours) et capture chaque phrase : image + ce que dit Nesa."""
import json, os, sys
from playwright.sync_api import sync_playwright

S, path, tag = sys.argv[1], sys.argv[2], sys.argv[3]
answers = json.loads(sys.argv[4]) if len(sys.argv) > 4 else []
turns = json.load(open(path))
calls = []
def handle(route):
    i = min(len(calls), len(turns) - 1)
    calls.append(1)
    route.fulfill(status=200, headers={"Content-Type": "application/x-ndjson"},
                  body="\n".join(json.dumps(e, ensure_ascii=False) for e in turns[i]) + "\n")

frames = []
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    pg = b.new_page(viewport={"width": 1280, "height": 760})
    pg.route("**/api/tutor", handle)
    pg.route("**/api/voice", lambda r: r.fulfill(status=503, body="{}"))
    pg.goto(os.environ.get("APP_URL", "http://localhost:3100/"))
    pg.wait_for_timeout(1500)
    pg.get_by_role("button", name="Couper la voix de Nesa").click()
    pg.get_by_role("textbox").first.fill("vecteurs")
    pg.keyboard.press("Enter")
    last = ""
    answered = 0
    for i in range(400):
        pg.wait_for_timeout(250)
        cap = pg.locator("section[aria-label=Nesa] [class*=caption]").first
        text = cap.inner_text().strip() if cap.count() else ""
        if text and text != last:
            last = text
            pg.wait_for_timeout(1900)  # laisser le dessin de la phrase se faire
            n = len(frames) + 1
            pg.screenshot(path=f"{S}/{tag}-{n:02d}.png")
            frames.append({"n": n, "say": text})
        if pg.locator("[role=group] button").count() > 0:
            if answered < len(answers):
                pg.locator("[role=group] button").nth(answers[answered]).click()
                answered += 1
                pg.wait_for_timeout(400)
            else:
                break
        if pg.get_by_text("Point d'étape").count() > 0:
            pg.wait_for_timeout(1000)
            pg.screenshot(path=f"{S}/{tag}-fin.png")
            break
    json.dump(frames, open(f"{S}/{tag}-frames.json", "w"), ensure_ascii=False, indent=1)
    print(len(frames), "captures")
    b.close()
