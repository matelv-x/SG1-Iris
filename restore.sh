#!/usr/bin/env bash
set -euo pipefail

TARGET="/home/pi/sg1_v4"
DRY_RUN=0

usage() {
  cat <<'EOF'
Usage:
  sudo ./restore.sh [--target /home/pi/sg1_v4] [--dry-run]

Surgically removes only the SG1 Iris add-on hooks and managed assets.
Creates a timestamped pre-restore backup before making changes.
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

if [ -d "$TARGET/web/retro" ]; then
  RETRO_DIR="$TARGET/web/retro"
  WEB_DIR="$TARGET/web"
elif [ -d "$TARGET/retro" ]; then
  RETRO_DIR="$TARGET/retro"
  WEB_DIR="$TARGET"
elif [ -f "$TARGET/dial.html" ] && [ -d "$TARGET/js" ] && [ -d "$TARGET/css" ]; then
  RETRO_DIR="$TARGET"
  WEB_DIR="$(dirname "$TARGET")"
else
  echo "Cannot find the Retro interface below target: $TARGET" >&2
  exit 1
fi

for file in "$RETRO_DIR/dial.html" "$RETRO_DIR/dial9.html" "$RETRO_DIR/js/dial.js"; do
  if [ ! -f "$file" ]; then
    echo "Missing required file: $file" >&2
    exit 1
  fi
done

BACKUP_BASE="$WEB_DIR/backups/sg1-iris-pre-restore-$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="$BACKUP_BASE"
suffix=1
while [ -e "$BACKUP_DIR" ]; do
  BACKUP_DIR="${BACKUP_BASE}-${suffix}"
  suffix=$((suffix + 1))
done

if [ "$DRY_RUN" -eq 0 ]; then
  mkdir -p "$BACKUP_DIR/retro/js" "$BACKUP_DIR/retro/css"
  cp "$RETRO_DIR/dial.html" "$BACKUP_DIR/retro/dial.html"
  cp "$RETRO_DIR/dial9.html" "$BACKUP_DIR/retro/dial9.html"
  cp "$RETRO_DIR/js/dial.js" "$BACKUP_DIR/retro/js/dial.js"
  [ -f "$RETRO_DIR/js/iris.js" ] && cp "$RETRO_DIR/js/iris.js" "$BACKUP_DIR/retro/js/iris.js" || true
  [ -f "$RETRO_DIR/css/iris.css" ] && cp "$RETRO_DIR/css/iris.css" "$BACKUP_DIR/retro/css/iris.css" || true
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
python3 "$SCRIPT_DIR/remove_iris.py" "$RETRO_DIR" "$DRY_RUN"

if [ "$DRY_RUN" -eq 1 ]; then
  echo "Dry run completed. No files were changed."
else
  echo "SG1 Iris removed successfully."
  echo "Pre-restore backup saved at: $BACKUP_DIR"
fi
