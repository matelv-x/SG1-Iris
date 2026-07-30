#!/usr/bin/env python3
from pathlib import Path
import re
import sys

if len(sys.argv) < 2:
    raise SystemExit("Usage: remove_iris.py RETRO_DIR [DRY_RUN]")

retro = Path(sys.argv[1])
dry_run = len(sys.argv) > 2 and sys.argv[2] == "1"

CSS_START = "<!-- SG1 IRIS ADDON CSS START -->"
CSS_END = "<!-- SG1 IRIS ADDON CSS END -->"
JS_START = "<!-- SG1 IRIS ADDON JS START -->"
JS_END = "<!-- SG1 IRIS ADDON JS END -->"
ASSET_MARKER = "SG1 IRIS ADDON ASSET"
INCOMING_START = "// SG1 IRIS INCOMING AUTO-CLOSE START"
INCOMING_END = "// SG1 IRIS INCOMING AUTO-CLOSE END"


def remove_hooks(path: Path) -> None:
    original = path.read_text(encoding="utf-8", errors="ignore")
    text = re.sub(
        re.escape(CSS_START) + r"[\s\S]*?" + re.escape(CSS_END) + r"\s*",
        "",
        original,
        flags=re.I,
    )
    text = re.sub(
        re.escape(JS_START) + r"[\s\S]*?" + re.escape(JS_END) + r"\s*",
        "",
        text,
        flags=re.I,
    )
    text = re.sub(
        r'^[ \t]*<link\b[^>]*href=["\']css/iris\.css["\'][^>]*>\s*$\n?',
        "",
        text,
        flags=re.I | re.M,
    )
    text = re.sub(
        r'^[ \t]*<script\b[^>]*src=["\']js/iris\.js["\'][^>]*></script>\s*$\n?',
        "",
        text,
        flags=re.I | re.M,
    )

    if text == original:
        print(f"no Iris hooks found: {path}")
    elif dry_run:
        print(f"would remove Iris hooks: {path}")
    else:
        path.write_text(text, encoding="utf-8")
        print(f"removed Iris hooks: {path}")


def remove_managed_asset(path: Path) -> None:
    if not path.exists():
        return
    text = path.read_text(encoding="utf-8", errors="ignore")
    if ASSET_MARKER not in text:
        print(f"preserving unrecognized file: {path}")
        return
    if dry_run:
        print(f"would remove managed asset: {path}")
    else:
        path.unlink()
        print(f"removed managed asset: {path}")

def remove_incoming_hook(path: Path) -> None:
    original = path.read_text(encoding="utf-8", errors="ignore")
    text = re.sub(
        re.escape(INCOMING_START) + r"[\s\S]*?" + re.escape(INCOMING_END) + r"\s*",
        "",
        original,
        flags=re.I,
    )
    if text == original:
        print(f"no Iris incoming hook found: {path}")
    elif dry_run:
        print(f"would remove Iris incoming hook: {path}")
    else:
        path.write_text(text, encoding="utf-8")
        print(f"removed Iris incoming hook: {path}")


for name in ("dial.html", "dial9.html"):
    remove_hooks(retro / name)

remove_incoming_hook(retro / "js/dial.js")
remove_managed_asset(retro / "js/iris.js")
remove_managed_asset(retro / "css/iris.css")
