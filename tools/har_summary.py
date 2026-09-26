#!/usr/bin/env python3
"""Summarize a HAR capture without leaking secrets or personal data.

Prints, per request: method, host, path, query parameter names, status,
request header and cookie *names*, response type and size, and for JSON
responses the key structure with every value replaced by its type.
Values are never printed. With --keywords, it reports which JSON paths
have a value containing one of the keywords (the value itself stays hidden).

Usage:
    python3 har_summary.py capture.har
    python3 har_summary.py capture.har --host myna.go.jp --keywords 難病 受給者 公費

Standard library only. Run it on your own machine; don't share the .har.
"""
import argparse
import base64
import json
import re
import sys
from urllib.parse import urlsplit, parse_qsl

STATIC = ("image/", "font/", "text/css", "javascript", "video/", "audio/")
DEFAULT_KEYWORDS = ["難病", "指定難病", "受給者", "公費", "特定医療", "医療費助成"]


ID_LIKE = re.compile(r"^(?=.*\d)[A-Za-z0-9_-]{6,}$")


def mask_path(path):
    """Replace ID-like path segments (long, containing digits) with <id>."""
    return "/".join("<id>" if ID_LIKE.match(seg) else seg for seg in path.split("/"))


def body_text(content):
    text = content.get("text")
    if text is None:
        return None
    if content.get("encoding") == "base64":
        try:
            return base64.b64decode(text).decode("utf-8", "replace")
        except ValueError:
            return None
    return text


def shape(value, depth=0, max_items=3):
    """Replace every value with its type, keep key names and nesting."""
    if isinstance(value, dict):
        return {k: shape(v, depth + 1) for k, v in value.items()}
    if isinstance(value, list):
        if not value:
            return []
        # Show the shape of the first few items and the total count.
        shapes = []
        for item in value[:max_items]:
            s = shape(item, depth + 1)
            if s not in shapes:
                shapes.append(s)
        return {"<list>": len(value), "items": shapes}
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, (int, float)):
        return "number"
    if value is None:
        return "null"
    return f"str[{len(value)}]"


def keyword_paths(value, keywords, path="$"):
    hits = []
    if isinstance(value, dict):
        for k, v in value.items():
            hits += keyword_paths(v, keywords, f"{path}.{k}")
    elif isinstance(value, list):
        for i, v in enumerate(value):
            hits += keyword_paths(v, keywords, f"{path}[{i}]")
    elif isinstance(value, str):
        for kw in keywords:
            if kw in value:
                hits.append(f"{path}  contains '{kw}'")
    return hits


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("har")
    ap.add_argument("--host", help="only hosts ending with this, e.g. myna.go.jp")
    ap.add_argument("--keywords", nargs="*", default=DEFAULT_KEYWORDS,
                    help="report JSON paths whose value contains these (values stay hidden)")
    ap.add_argument("--include-static", action="store_true", help="also list images, css, js, fonts")
    args = ap.parse_args()

    with open(args.har, encoding="utf-8") as f:
        entries = json.load(f)["log"]["entries"]

    shown = 0
    for e in entries:
        req, res = e["request"], e["response"]
        url = urlsplit(req["url"])
        host = url.hostname or ""
        if args.host and not host.endswith(args.host):
            continue
        content = res.get("content", {})
        mime = content.get("mimeType", "")
        if not args.include_static and any(s in mime for s in STATIC):
            continue
        shown += 1

        size = content.get("size", -1)
        print("=" * 72)
        print(f"{req['method']} {host}{mask_path(url.path)}   -> {res['status']}  {mime}  {size} bytes")
        params = sorted({k for k, _ in parse_qsl(url.query, keep_blank_values=True)})
        if params:
            print(f"  query params : {', '.join(params)}")
        headers = sorted({h['name'].lower() for h in req.get("headers", []) if not h['name'].startswith(":")})
        print(f"  req headers  : {', '.join(headers)}")
        cookies = sorted({c['name'] for c in req.get("cookies", [])})
        if cookies:
            print(f"  cookies      : {', '.join(cookies)}")
        if req.get("postData"):
            pd = req["postData"]
            print(f"  request body : {pd.get('mimeType', '')}, {len(pd.get('text', '') or '')} chars")

        text = body_text(content)
        if text and "json" in mime:
            try:
                data = json.loads(text)
            except ValueError:
                print("  response     : (not valid JSON)")
                continue
            print("  response shape:")
            for line in json.dumps(shape(data), ensure_ascii=False, indent=2).splitlines():
                print("    " + line)
            hits = keyword_paths(data, args.keywords)
            if hits:
                print("  keyword hits :")
                for h in hits[:50]:
                    print("    " + h)
        elif text and args.keywords and any(kw in text for kw in args.keywords):
            found = [kw for kw in args.keywords if kw in text]
            print(f"  keyword hits : body contains {', '.join(found)} (non-JSON)")

    print("=" * 72)
    print(f"{shown} requests summarized. No header, cookie or body values were printed.")


if __name__ == "__main__":
    sys.exit(main())
