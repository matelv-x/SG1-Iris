#!/usr/bin/env bash
set -euo pipefail

TARGET="/home/pi/sg1_v4"
DRY_RUN=0

usage() {
  cat <<'EOF'
Usage:
  sudo ./install.sh [--target /home/pi/sg1_v4] [--dry-run]

SG1 Iris add-on installer for the Retro interface.

Compatible targets:
  --target /home/pi/sg1_v4
  --target /home/pi/sg1_v4/web
  --target /home/pi/sg1_v4/web/retro

What it changes:
  - copies retro/js/iris.js and retro/css/iris.css
  - injects marked CSS/JS hooks into dial.html and dial9.html
  - iris.js reads gate status directly, so retro/js/dial.js is not modified
  - removes the old marked dial.js hook from earlier Iris versions when found
  - automatically closes and holds the iris closed for every incoming
  - preserves existing Retro rings, symbols, chevrons and other add-ons
  - creates a timestamped backup before editing
  - can be safely re-run without duplicate hooks

Options:
  --dry-run  Validate and show planned changes without writing files
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

resolve_retro_dir() {
  if [ -d "$1/web/retro" ]; then
    RETRO_DIR="$1/web/retro"
    WEB_DIR="$1/web"
  elif [ -d "$1/retro" ]; then
    RETRO_DIR="$1/retro"
    WEB_DIR="$1"
  elif [ -f "$1/dial.html" ] && [ -d "$1/js" ] && [ -d "$1/css" ]; then
    RETRO_DIR="$1"
    WEB_DIR="$(dirname "$1")"
  else
    echo "Cannot find the Retro interface below target: $1" >&2
    exit 1
  fi
}

need_file() {
  if [ ! -f "$1" ]; then
    echo "Missing required file: $1" >&2
    exit 1
  fi
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ASSET_DIR="$SCRIPT_DIR/assets/retro"
resolve_retro_dir "$TARGET"

need_file "$ASSET_DIR/js/iris.js"
need_file "$ASSET_DIR/css/iris.css"
need_file "$RETRO_DIR/dial.html"
need_file "$RETRO_DIR/dial9.html"

BACKUP_BASE="$WEB_DIR/backups/sg1-iris-$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="$BACKUP_BASE"
suffix=1
while [ -e "$BACKUP_DIR" ]; do
  BACKUP_DIR="${BACKUP_BASE}-${suffix}"
  suffix=$((suffix + 1))
done

echo "Target Retro folder: $RETRO_DIR"
echo "Backup: $BACKUP_DIR"

if [ "$DRY_RUN" -eq 1 ]; then
  echo "Dry run only. No files will be changed."
else
  mkdir -p "$BACKUP_DIR/retro/js" "$BACKUP_DIR/retro/css"
  cp "$RETRO_DIR/dial.html" "$BACKUP_DIR/retro/dial.html"
  cp "$RETRO_DIR/dial9.html" "$BACKUP_DIR/retro/dial9.html"
  [ -f "$RETRO_DIR/js/dial.js" ] && cp "$RETRO_DIR/js/dial.js" "$BACKUP_DIR/retro/js/dial.js" || true
  [ -f "$RETRO_DIR/js/iris.js" ] && cp "$RETRO_DIR/js/iris.js" "$BACKUP_DIR/retro/js/iris.js" || true
  [ -f "$RETRO_DIR/css/iris.css" ] && cp "$RETRO_DIR/css/iris.css" "$BACKUP_DIR/retro/css/iris.css" || true

  cp "$ASSET_DIR/js/iris.js" "$RETRO_DIR/js/iris.js"
  cp "$ASSET_DIR/css/iris.css" "$RETRO_DIR/css/iris.css"
fi

python3 - "$RETRO_DIR" "$DRY_RUN" <<'PY'
from pathlib import Path
import re
import sys

retro = Path(sys.argv[1])
dry_run = sys.argv[2] == "1"

CSS_START = "<!-- SG1 IRIS ADDON CSS START -->"
CSS_END = "<!-- SG1 IRIS ADDON CSS END -->"
JS_START = "<!-- SG1 IRIS ADDON JS START -->"
JS_END = "<!-- SG1 IRIS ADDON JS END -->"
INCOMING_START = "// SG1 IRIS INCOMING AUTO-CLOSE START"
INCOMING_END = "// SG1 IRIS INCOMING AUTO-CLOSE END"

CSS_HOOK = f"""{CSS_START}
    <link rel="stylesheet" href="css/iris.css?v=20260730-pause-both-directions" />
    {CSS_END}"""

JS_HOOK = f"""{JS_START}
    <script type="module" src="js/iris.js?v=20260730-pause-both-directions"></script>
    {JS_END}"""

def remove_existing_hooks(text: str) -> str:
    text = re.sub(
        re.escape(CSS_START) + r"[\s\S]*?" + re.escape(CSS_END) + r"\s*",
        "",
        text,
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
    return text

def patch_html(path: Path) -> None:
    original = path.read_text(encoding="utf-8", errors="ignore")
    text = remove_existing_hooks(original)

    css_pattern = re.compile(
        r'(?P<line>^[ \t]*<link rel=["\']stylesheet["\'] href=["\']css/dial9?\.css(?:\?[^"\']*)?["\']\s*/?>[ \t]*$)',
        re.I | re.M,
    )
    text, css_count = css_pattern.subn(
        lambda match: match.group("line") + "\n    " + CSS_HOOK,
        text,
        count=1,
    )
    if css_count != 1:
        raise SystemExit(f"ERROR: Cannot find Retro dial stylesheet hook in {path}")

    js_pattern = re.compile(
        r'(?P<line>^[ \t]*<script type=["\']module["\'] src=["\']js/dial\.js(?:\?[^"\']*)?["\']></script>[ \t]*$)',
        re.I | re.M,
    )
    text, js_count = js_pattern.subn(
        lambda match: "    " + JS_HOOK + "\n" + match.group("line"),
        text,
        count=1,
    )
    if js_count != 1:
        raise SystemExit(f"ERROR: Cannot find Retro dial.js hook in {path}")

    if text == original:
        print(f"no HTML changes needed: {path}")
    elif dry_run:
        print(f"would patch HTML: {path}")
    else:
        path.write_text(text, encoding="utf-8")
        print(f"patched HTML: {path}")

for name in ("dial.html", "dial9.html"):
    patch_html(retro / name)

dial_js = retro / "js/dial.js"
if dial_js.exists():
    original = dial_js.read_text(encoding="utf-8", errors="ignore")
    text = re.sub(
        re.escape(INCOMING_START) + r"[\s\S]*?" + re.escape(INCOMING_END) + r"\s*",
        "",
        original,
        flags=re.I,
    )
    if text != original:
        if dry_run:
            print(f"would remove old Iris dial.js hook: {dial_js}")
        else:
            dial_js.write_text(text, encoding="utf-8")
            print(f"removed old Iris dial.js hook: {dial_js}")
PY

if [ "$DRY_RUN" -eq 1 ]; then
  echo "Dry run completed."
else
  echo "SG1 Iris installed successfully."
  echo "Backup saved at: $BACKUP_DIR"
  echo "Control: Ctrl+I"
fi
