#!/usr/bin/env python3
"""Dump everything readable from Myna Portal into myna_data/, one JSON per query.

Uses the session cookie in .myna_cookie at the repo root (the "name=value; ..."
string from DevTools > Copy as cURL > -b '...'). Prints only status lines; the
data itself goes to disk. myna_data/ and .myna_cookie are git-ignored.

    python3 tools/myna_dump.py                   # everything
    python3 tools/myna_dump.py --skip-selfinfo   # fast endpoints only
    python3 tools/myna_dump.py --only-selfinfo --resume

自己情報 (selfinfo) items are formal requests through the マイナンバー information
network. The server rate-limits them (resultCode 1000 = blockade), so the loop
paces itself, stops on a blockade, and --resume skips items already finished.
"""
import argparse, base64, json, os, sys, time, urllib.request, urllib.error
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parent
OUT = ROOT / "myna_data"
BASE = "https://myna.go.jp"
COOKIE = None


def post(path, body):
    req = urllib.request.Request(
        BASE + path, data=json.dumps(body).encode(), method="POST",
        headers={"content-type": "application/json", "origin": BASE,
                 "referer": BASE + "/", "cookie": COOKIE,
                 "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            try:
                return r.status, json.loads(raw or b"null")
            except ValueError:
                return r.status, {"nonJson": raw.decode("utf-8", "replace")[:2000],
                                  "contentType": r.headers.get("content-type")}
    except urllib.error.HTTPError as e:
        return e.code, {"httpError": e.code, "body": e.read().decode("utf-8", "replace")}


def b64json(obj):
    return base64.b64encode(json.dumps(obj).encode()).decode()


def decode_pmh(j):
    res = (j or {}).get("resBody") or {}
    enc = res.get("encodedResponseData") if isinstance(res, dict) else None
    if enc:
        try:
            return json.loads(base64.b64decode(enc))
        except ValueError:
            return None


def save(rel, path, body, status, resp, extra=None):
    f = OUT / f"{rel}.json"
    f.parent.mkdir(parents=True, exist_ok=True)
    rec = {"endpoint": path, "request": body, "httpStatus": status, "response": resp,
           "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z")}
    if extra:
        rec.update(extra)
    f.write_text(json.dumps(rec, ensure_ascii=False, indent=2))
    os.chmod(f, 0o600)
    r = resp if isinstance(resp, dict) else {}
    errs = ",".join(e.get("errorCode", "?") for e in (r.get("errors") or []))
    print(f"{rel:<45} http={status} result={r.get('resultCode')} {errs} bytes={len(json.dumps(resp))}")


def ch(sid):
    assert len(sid) == 14, sid  # server rejects anything but exactly 14 chars
    return {"screenId": sid}


# (output file, path, body). Bodies taken from the portal's own JS.
SIMPLE = [
    ("common/is-login", "/api/common/login/is-login", {"commonHeader": ch("home__________")}),
    ("common/municipality", "/api/common/municipality/get",
     {"commonHeader": ch("home__________"), "reqBody": {"prefecturesListSelValue": ""}}),
    ("my/userinfo", "/api/my/userinfo/get", {"commonHeader": ch("home__________")}),
    ("my/my-number-card", "/api/my/my-number-card/get-info", {"commonHeader": ch("home__________")}),
    ("my/bank-account-status", "/api/my/bank-account/get-status", {"commonHeader": ch("home__________")}),
    ("my/notification-list", "/api/my/notification/list", {"commonHeader": ch("home__________"), "reqBody": {}}),
    ("my/history-list", "/api/my/history/list", {"commonHeader": ch("home__________"), "reqBody": {}}),
    ("my/identity-linkage-list", "/api/my/identity-linkage/list", {"commonHeader": ch("home__________")}),
    ("health/medical-expenses", "/api/my/healthinfo/get-medical-expenses", {"commonHeader": ch("medical-expens")}),
    ("health/medicine-info", "/api/my/healthinfo/get-medicine-info", {"commonHeader": ch("medicine_past_")}),
    ("health/health-insurance-card", "/api/my/healthinfo/get-health-insurance-card-info",
     {"commonHeader": ch("ctf_healthIns_")}),
    ("health/specific-medical-check", "/api/my/healthinfo/get-specificmedicalcheck-info",
     {"commonHeader": ch("health_checkup"), "reqBody": {"forceRequest": True}}),
    ("health/czdi-info", "/api/my/healthinfo/get-czdi-info", {"commonHeader": ch("medical-expens")}),
    ("health/shpr-info", "/api/my/healthinfo/get-shpr-info", {"commonHeader": ch("medicine_past_")}),
    ("health/medicine-shpr-czdi-info", "/api/my/healthinfo/get-medicine-shpr-czdi-info",
     {"commonHeader": ch("medicine_past_"), "reqBody": {}}),
    ("health/patient-summary", "/api/my/healthinfo/get-patient-summary-info", {"commonHeader": ch("hm_ps_________")}),
]
# 電子カルテ情報共有サービス: SBM 傷病名, KSS 感染症, KNS 検査, SHO 処方, YKK 薬剤禁忌, ARG アレルギー
for cat in ["SBM", "KSS", "KNS", "SHO", "YKK", "ARG"]:
    SIMPLE.append((f"health/six-medical-info_{cat}", "/api/my/healthinfo/get-six-medical-info",
                   {"reqBody": {"cipCategory": cat}, "commonHeader": ch("hm_mc_________")}))

PMH = [
    ("pmh/medicalsubsidy_list", "/api/my/pmh-info/send-medicalsubsidy/v3", "medical_subsid",
     {"operation": "GetMedicalSubsidyList"}),
]

# selfiTranStatusCd: 01/09 pending, 02 done, 03 done (+resultList), 04 done with nothing, 06 capacity over
PENDING = ("01", "09", None)


def selfinfo(code):
    body = {"commonHeader": ch("home__________"),
            "reqBody": {"fieldCd": "", "fieldDetailCd": "", "personInfoNameCd": code, "targetYear": ""}}
    st = lambda j: ((j or {}).get("resBody") or {}).get("selfiTranStatusCd")
    done = lambda j: st(j) == "02" or (st(j) == "03" and j["resBody"].get("resultList"))
    s, j = post("/api/my/selfinfo/get", body)
    if not done(j) and st(j) not in ("01", "09"):
        s, j = post("/api/my/selfinfo/request", body)
        if (j or {}).get("resultCode") != "0000":
            return body, s, j
    for _ in range(40):
        if st(j) not in PENDING:
            break
        time.sleep(3)
        s, j = post("/api/my/selfinfo/get", body)
    return body, s, j


def main():
    global COOKIE
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--skip-selfinfo", action="store_true")
    g.add_argument("--only-selfinfo", action="store_true")
    ap.add_argument("--resume", action="store_true", help="skip selfinfo items already finished")
    ap.add_argument("--pace", type=float, default=10, help="seconds between selfinfo items")
    a = ap.parse_args()

    COOKIE = (ROOT / ".myna_cookie").read_text().strip()
    if "=" not in COOKIE:
        sys.exit(".myna_cookie needs name=value pairs, e.g. SESSION=...; tid=...")
    OUT.mkdir(exist_ok=True)
    os.chmod(OUT, 0o700)
    (OUT / ".gitignore").write_text("*\n")

    s, j = post("/api/common/login/is-login", {"commonHeader": ch("home__________")})
    if str(((j or {}).get("resBody") or {}).get("loginInfo", {}).get("isLogin")) != "true":
        sys.exit("not logged in: refresh .myna_cookie")

    if not a.only_selfinfo:
        for rel, path, body in SIMPLE:
            s, j = post(path, body)
            save(rel, path, body, s, j)
            time.sleep(0.5)
        for rel, path, sid, op in PMH:
            body = {"commonHeader": ch(sid), "reqBody": {"encodedRequestData": b64json(op)}}
            s, j = post(path, body)
            save(rel, path, body, s, j, {"decodedResponse": decode_pmh(j)})

    if a.skip_selfinfo:
        return
    items = json.loads((TOOLS / "selfinfo_items.json").read_text())
    names = {i["id"]: i["name"] for i in items}
    for n in sorted(set(names) | {31, 64, 84, 86}):  # extra codes seen in the portal's JS
        code = f"TM{n:014d}"
        rel = f"selfinfo/{n:03d}_{code}"
        prev = OUT / f"{rel}.json"
        if a.resume and prev.exists() and json.loads(prev.read_text()).get("selfiTranStatusCd") not in PENDING:
            continue
        body, s, j = selfinfo(code)
        res = (j or {}).get("resBody") or {}
        st, cnt = res.get("selfiTranStatusCd"), len(res.get("resultList") or [])
        save(rel, "/api/my/selfinfo/{request,get}", body, s, j,
             {"itemName": names.get(n), "selfiTranStatusCd": st, "resultCount": cnt})
        print(f"{'':45} status={st} results={cnt}")
        if (j or {}).get("resultCode") == "1000" or st == "06":
            sys.exit("server blockade / capacity over: stop and rerun later with --resume")
        time.sleep(a.pace)


if __name__ == "__main__":
    main()
