#!/usr/bin/env bash
# Deploy SecurePass on the VPS.
#
#   sudo scripts/deploy.sh <branch>     deploy the latest commit of <branch>
#   sudo scripts/deploy.sh --rollback   return to the commit saved by the last deploy
#
# Steps follow deploy/VPS_SUPABASE.md: npm ci / lint / build, release owned by
# root and readable by the securepass group, then restart the systemd service.
set -euo pipefail

APP_DIR=/opt/securepass
SERVICE=securepass
STATE_DIR=/var/lib/securepass-deploy
ROLLBACK_FILE="$STATE_DIR/previous-commit"
PORT="${PORT:-8181}"

usage() {
  echo "Usage: $0 <branch> | --rollback" >&2
  exit 2
}

[[ $# -eq 1 ]] || usage
[[ $EUID -eq 0 ]] || { echo "Run as root." >&2; exit 1; }
[[ "$(pwd -P)" == "$APP_DIR" ]] || { echo "Run from $APP_DIR." >&2; exit 1; }

build() {
  npm ci --ignore-scripts --no-audit --no-fund
  npm run lint
  npm run build
  chown -R root:securepass "$APP_DIR"
  chmod -R g+rX,g-w,o-w "$APP_DIR"
}

restart_and_check() {
  systemctl restart "$SERVICE"
  sleep 5
  systemctl status "$SERVICE" --no-pager || true
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/" || true)"
  echo "Homepage HTTP status: $code"
  systemctl is-active --quiet "$SERVICE" || { echo "Service is not active." >&2; exit 1; }
  [[ "$code" == "200" ]] || { echo "Homepage did not return 200." >&2; exit 1; }
}

if [[ "$1" == "--rollback" ]]; then
  [[ -s "$ROLLBACK_FILE" ]] || { echo "No saved commit in $ROLLBACK_FILE." >&2; exit 1; }
  target="$(cat "$ROLLBACK_FILE")"
  echo "Rolling back to $target"
  git checkout --detach "$target"
  build
  restart_and_check
  echo "Rolled back to $(git rev-parse HEAD)"
  exit 0
fi

[[ "$1" == -* ]] && usage
branch="$1"

current="$(git rev-parse HEAD)"
install -d -m 700 "$STATE_DIR"
echo "$current" > "$ROLLBACK_FILE"
echo "Current commit (saved for rollback): $current"

git fetch origin
git checkout "$branch"
git pull --ff-only origin "$branch"
echo "Deploying $branch at $(git rev-parse HEAD)"

build
restart_and_check
echo "Deployed. Roll back with: $0 --rollback"
