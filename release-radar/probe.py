#!/usr/bin/env python3
"""
Release Radar — Audible API Probe
Validates the public Audible catalog endpoint and shows the exact data shape.

Run with: python probe.py
No dependencies beyond Python stdlib.
"""

import json
import urllib.request
import urllib.parse
import sys

# ── Series to test ─────────────────────────────────────────────────────────────
TEST_QUERIES = [
    "Cradle Will Wight",
    "Dungeon Crawler Carl",
    "Iron Prince",
]

# ── Audible US public catalog endpoint ─────────────────────────────────────────
AUDIBLE_API = "https://api.audible.com/1.0/catalog/products"

RESPONSE_GROUPS = ",".join([
    "product_desc",
    "product_attrs",
    "media",
    "series",
    "relationships",
    "product_plan_details",
])

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
}


def search(keywords: str, num_results: int = 5) -> dict:
    params = {
        "keywords": keywords,
        "num_results": str(num_results),
        "response_groups": RESPONSE_GROUPS,
        "sort_by": "-PublicationDate",
    }
    url = AUDIBLE_API + "?" + urllib.parse.urlencode(params)
    print(f"  GET {url[:110]}...")

    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            raw = resp.read().decode("utf-8")
            return {"status": resp.status, "data": json.loads(raw)}
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:400]
        return {"status": e.code, "error": str(e), "body": body}
    except Exception as e:
        return {"status": 0, "error": str(e)}


def print_product(p: dict, idx: int) -> None:
    print(f"\n  [{idx}] {p.get('title', '—')}")
    print(f"       ASIN        : {p.get('asin', '—')}")
    print(f"       Release date: {p.get('release_date', '—')}")
    print(f"       Pre-order   : {p.get('is_purchasability_suppressed', '—')}")

    authors = p.get("authors") or []
    print(f"       Authors     : {[a.get('name') for a in authors]}")

    narrators = p.get("narrators") or []
    print(f"       Narrators   : {[n.get('name') for n in narrators]}")

    series_list = p.get("series") or []
    if series_list:
        for s in series_list:
            print(f"       Series      : {s.get('title')} #{s.get('sequence', '?')}")

    fmt = p.get("format_type") or p.get("format") or "—"
    runtime = p.get("runtime_length_min", "—")
    print(f"       Format/mins : {fmt} / {runtime}")

    imgs = p.get("product_images") or {}
    cover = imgs.get("500") or imgs.get("1215") or next(iter(imgs.values()), "—")
    print(f"       Cover URL   : {cover}")


def run():
    first_products = []

    for query in TEST_QUERIES:
        print(f"\n{'═'*65}")
        print(f"Query: \"{query}\"")
        result = search(query)

        if "error" in result:
            print(f"  FAILED  HTTP {result['status']}: {result['error']}")
            if result.get("body"):
                print(f"  Body: {result['body']}")
            continue

        products = result["data"].get("products", [])
        total = result["data"].get("total_results", "?")
        print(f"  HTTP {result['status']} — {len(products)} results (total: {total})")

        for i, p in enumerate(products[:3]):
            print_product(p, i + 1)
            if i == 0 and not first_products:
                first_products.append(p)

    # ── Full raw dump of first result ──────────────────────────────────────────
    if first_products:
        print(f"\n\n{'═'*65}")
        print("FULL RAW JSON — first result (for field discovery):")
        print(json.dumps(first_products[0], indent=2))
    else:
        print("\nNo results captured — all queries failed.")
        sys.exit(1)


if __name__ == "__main__":
    run()
