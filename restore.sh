#!/usr/bin/env bash
set -euo pipefail

TARGET="/home/pi/sg1_v4"
DRY_RUN=0

usage() {
  cat <<'EOF'
Usage:
  sudo ./restore.sh [--target /home/pi/sg1_v4] [--dry-run]

Surgically removes only the SG1 Iris add-on hooks and managed assets.
Moves the managed Iris Black Hole warning back to its original SG1 folder.
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

find_sg1_root() {
  local candidate="$RETRO_DIR"
  while [ "$candidate" != "/" ]; do
    if [ -d "$candidate/web/retro" ] &&
      [ -d "$candidate/soundfx/milkyway/audio_clips" ]; then
      SG1_ROOT="$candidate"
      return
    fi
    candidate="$(dirname "$candidate")"
  done
  echo "Cannot find the SG1 soundfx folder above: $RETRO_DIR" >&2
  exit 1
}

find_sg1_root
IRIS_AUDIO_ROOT="$SG1_ROOT/soundfx/milkyway/audio_clips/Iris"
IRIS_AUDIO_DIR="$IRIS_AUDIO_ROOT/black_hole"
IRIS_AUDIO_FILE="$IRIS_AUDIO_DIR/outgoing wormhole.wav"
IRIS_AUDIO_MARKER="$IRIS_AUDIO_DIR/.sg1-iris-managed"
BLACK_HOLE_SOURCE_DIR="$SG1_ROOT/soundfx/milkyway/audio_clips/black_hole"
BLACK_HOLE_SOURCE="$BLACK_HOLE_SOURCE_DIR/outgoing wormhole.wav"

if [ -f "$IRIS_AUDIO_MARKER" ] && [ -f "$IRIS_AUDIO_FILE" ] && [ -e "$BLACK_HOLE_SOURCE" ]; then
  echo "Refusing to overwrite existing original audio file: $BLACK_HOLE_SOURCE" >&2
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
  mkdir -p "$BACKUP_DIR/retro/js" "$BACKUP_DIR/retro/css" "$BACKUP_DIR/soundfx"
  cp "$RETRO_DIR/dial.html" "$BACKUP_DIR/retro/dial.html"
  cp "$RETRO_DIR/dial9.html" "$BACKUP_DIR/retro/dial9.html"
  cp "$RETRO_DIR/js/dial.js" "$BACKUP_DIR/retro/js/dial.js"
  [ -f "$RETRO_DIR/js/iris.js" ] && cp "$RETRO_DIR/js/iris.js" "$BACKUP_DIR/retro/js/iris.js" || true
  [ -f "$RETRO_DIR/css/iris.css" ] && cp "$RETRO_DIR/css/iris.css" "$BACKUP_DIR/retro/css/iris.css" || true
  [ -d "$SG1_ROOT/soundfx/milkyway/audio_clips/Iris/EOverM" ] \
    && cp -a "$SG1_ROOT/soundfx/milkyway/audio_clips/Iris/EOverM" "$BACKUP_DIR/soundfx/EOverM" \
    || true
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
python3 "$SCRIPT_DIR/remove_iris.py" "$RETRO_DIR" "$DRY_RUN"

if [ -f "$IRIS_AUDIO_MARKER" ]; then
  if [ "$DRY_RUN" -eq 1 ]; then
    if [ -f "$IRIS_AUDIO_FILE" ]; then
      echo "would move managed Iris audio back:"
      echo "  from: $IRIS_AUDIO_FILE"
      echo "  to:   $BLACK_HOLE_SOURCE"
    fi
    echo "would remove managed Iris audio marker: $IRIS_AUDIO_MARKER"
  else
    if [ -f "$IRIS_AUDIO_FILE" ]; then
      mkdir -p "$BLACK_HOLE_SOURCE_DIR"
      mv "$IRIS_AUDIO_FILE" "$BLACK_HOLE_SOURCE"
      echo "restored original Black Hole warning: $BLACK_HOLE_SOURCE"
    fi
    rm "$IRIS_AUDIO_MARKER"
    rmdir "$IRIS_AUDIO_DIR" 2>/dev/null || true
    rmdir "$IRIS_AUDIO_ROOT" 2>/dev/null || true
  fi
elif [ -e "$IRIS_AUDIO_FILE" ]; then
  echo "preserving unmanaged audio file: $IRIS_AUDIO_FILE"
fi

EOVERM_AUDIO_DIR="$SG1_ROOT/soundfx/milkyway/audio_clips/Iris/EOverM"
EOVERM_AUDIO_FILES=(
  "Iris Open.m4a"
  "Iris Close.mp3"
  "Iris Impact.m4a"
)

for audio_file in "${EOVERM_AUDIO_FILES[@]}"; do
  path="$EOVERM_AUDIO_DIR/$audio_file"
  if [ -f "$path" ]; then
    if [ "$DRY_RUN" -eq 1 ]; then
      echo "would remove Iris audio: $path"
    else
      rm -f "$path"
      echo "removed Iris audio: $path"
    fi
  fi
done

if [ "$DRY_RUN" -eq 0 ] && [ -d "$EOVERM_AUDIO_DIR" ]; then
  rmdir "$EOVERM_AUDIO_DIR" 2>/dev/null || true
fi

if [ "$DRY_RUN" -eq 1 ]; then
  echo "Dry run completed. No files were changed."
else
  echo "SG1 Iris removed successfully."
  echo "Pre-restore backup saved at: $BACKUP_DIR"
fi
