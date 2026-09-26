#!/usr/bin/env bash
# Query one Myna Portal 自己情報 item with curl. Default: ID 82
# (特定医療費 / 指定難病 登録者証).
#
# Setup: in Chrome DevTools > Network on myna.go.jp (logged in), right-click any
# /api/my/ request > Copy > Copy as cURL, and put the string inside -b '...'
# (name=value; name=value ...) into .myna_cookie at the repo root.
#
# Usage: tools/nanbyo_selfinfo.sh [personInfoNameCd]   (default TM00000000000082)
#   SHOW=0      don't print the final response (status lines only)
#   POLLS, POLL_SECS   polling budget (default 60 x 5s)
set -euo pipefail

CODE="${1:-TM00000000000082}"
SCREEN_ID="${SCREEN_ID:-home__________}"   # must be exactly 14 chars
COOKIE_FILE="${COOKIE_FILE:-$(dirname "$0")/../.myna_cookie}"
[[ -s "$COOKIE_FILE" ]] || { echo "put your cookie string in $COOKIE_FILE" >&2; exit 1; }
grep -q '=' "$COOKIE_FILE" || { echo "$COOKIE_FILE needs name=value pairs (e.g. SESSION=abc; tid=def), not just a value" >&2; exit 1; }

BODY=$(printf '{"commonHeader":{"screenId":"%s"},"reqBody":{"fieldCd":"","fieldDetailCd":"","personInfoNameCd":"%s","targetYear":""}}' "$SCREEN_ID" "$CODE")

call() {
  curl -sS "https://myna.go.jp/api/my/selfinfo/$1" \
    -H "content-type: application/json" \
    -H "origin: https://myna.go.jp" \
    -H "referer: https://myna.go.jp/" \
    -H "cookie: $(cat "$COOKIE_FILE")" \
    --data "$BODY"
}

status() {  # prints: resultCode selfiTranStatusCd resultCount errors
  python3 -c 'import json,sys; j=json.load(sys.stdin); r=j.get("resBody") or {}; print(j.get("resultCode"), r.get("selfiTranStatusCd"), len(r.get("resultList") or []), json.dumps(j.get("errors"), ensure_ascii=False))'
}

echo "== get (cached?)"
R=$(call get); echo "$R" | status
case "$(echo "$R" | status)" in 9000*ED1107*) echo "not logged in: check the cookie" >&2; exit 1;; esac

# 02, or 03 with results = done. Otherwise request (unless one is already pending) and poll.
if ! echo "$R" | python3 -c 'import json,sys; r=(json.load(sys.stdin).get("resBody") or {}); sys.exit(0 if r.get("selfiTranStatusCd")=="02" or (r.get("selfiTranStatusCd")=="03" and r.get("resultList")) else 1)'; then
  if echo "$R" | status | grep -qE '^0000 (01|09) '; then
    echo "== request already pending, polling only"
  else
    echo "== request"
    call request | status
  fi
  for i in $(seq 1 "${POLLS:-60}"); do
    sleep "${POLL_SECS:-5}"
    R=$(call get); S=$(echo "$R" | status); echo "poll $i: $S"
    # 01/09 = pending (the portal keeps polling); anything else is final.
    # 04 with no resultList = finished, nothing on record.
    case "$S" in "0000 01 "*|"0000 09 "*|"0000 None "*) ;; *) break;; esac
  done
fi

if [[ "${SHOW:-1}" == 1 ]]; then
  echo "== final response"
  echo "$R" | python3 -m json.tool --no-ensure-ascii
fi
