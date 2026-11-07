#!/usr/bin/env python3
"""Find recent arXiv astro-ph.CO papers that may belong in data/papers/.

Queries the arXiv API for the last N days, drops papers already in the data
folder, scores the rest by keyword hits, and writes a Markdown checklist that
the weekly workflow turns into a GitHub issue. Standard library only.

    python3 scripts/arxiv_watch.py --days 8 --out candidates.md
    python3 scripts/arxiv_watch.py --days 30            # print to stdout
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAPERS = ROOT / "data" / "papers"
API = "https://export.arxiv.org/api/query"
NS = {"a": "http://www.w3.org/2005/Atom"}

# Phrases searched in the abstract (arXiv API syntax). Keep this list short and
# specific; the scoring below ranks what comes back.
QUERY_TERMS = [
    '"expansion history"',
    '"dark energy equation of state"',
    '"dynamical dark energy"',
    '"baryon acoustic oscillation"',
    '"Hubble constant"',
    '"Hubble tension"',
    '"cosmological constraints"',
    '"distance ladder"',
    '"time-delay cosmography"',
    '"cosmic chronometers"',
]

# (pattern, weight) — applied to title + abstract, case-insensitive
SCORE = [
    (r"\bw_?0\b.*\bw_?a\b|\bw0wa\b|\bCPL\b", 4),
    (r"expansion history|expansion rate", 3),
    (r"dark energy", 2),
    (r"baryon acoustic|\bBAO\b", 2),
    (r"Hubble constant|\bH_?0\b", 2),
    (r"type ia supernova|\bSNe? Ia\b|supernova compilation", 2),
    (r"cosmological (parameter|constraint)", 2),
    (r"\bDESI\b|\bEuclid\b|\bRubin\b|\bLSST\b|\bRoman\b|\bDES\b|\bPlanck\b|\bACT\b|\bSPT\b|Pantheon|Union3|SH0ES|JWST", 1),
    (r"collaboration", 1),
    (r"\bforecast|\bfisher\b|\bsimulat", -2),  # forecasts and method papers rank lower
    (r"modified gravity|f\(R\)|teleparallel|brane", -1),
]


def known_arxiv_ids() -> set[str]:
    ids = set()
    for f in PAPERS.glob("*.json"):
        try:
            ids.add(json.loads(f.read_text(encoding="utf-8"))["arxiv"])
        except Exception as e:  # noqa: BLE001
            print(f"warning: could not read {f.name}: {e}", file=sys.stderr)
    return ids


def fetch(query: str, max_results: int) -> list[dict]:
    params = {
        "search_query": query,
        "sortBy": "submittedDate",
        "sortOrder": "descending",
        "max_results": str(max_results),
    }
    url = f"{API}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"User-Agent": "expansion-history-site/0.1 (arxiv watch)"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        root = ET.fromstring(resp.read())
    out = []
    for e in root.findall("a:entry", NS):
        full_id = e.findtext("a:id", default="", namespaces=NS)
        m = re.search(r"abs/([^v]+)(v\d+)?$", full_id)
        if not m:
            continue
        out.append(
            {
                "id": m.group(1),
                "title": " ".join(e.findtext("a:title", default="", namespaces=NS).split()),
                "abstract": " ".join(e.findtext("a:summary", default="", namespaces=NS).split()),
                "published": e.findtext("a:published", default="", namespaces=NS),
                "authors": [a.findtext("a:name", default="", namespaces=NS) for a in e.findall("a:author", NS)],
                "categories": [c.get("term", "") for c in e.findall("a:category", NS)],
            }
        )
    return out


def score(p: dict) -> int:
    text = f"{p['title']} {p['abstract']}"
    s = 0
    for pat, w in SCORE:
        if re.search(pat, text, flags=re.I):
            s += w
    return s


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=8)
    ap.add_argument("--max", type=int, default=150)
    ap.add_argument("--min-score", type=int, default=5)
    ap.add_argument("--out", type=Path, default=None, help="write Markdown here (only if there are candidates)")
    args = ap.parse_args()

    since = datetime.now(timezone.utc) - timedelta(days=args.days)
    known = known_arxiv_ids()
    query = "cat:astro-ph.CO AND (" + " OR ".join(f"abs:{t}" for t in QUERY_TERMS) + ")"

    try:
        papers = fetch(query, args.max)
    except Exception as e:  # noqa: BLE001
        print(f"arXiv query failed: {e}", file=sys.stderr)
        return 1
    time.sleep(1)  # be polite to the API

    seen = set()
    cands = []
    for p in papers:
        if p["id"] in seen or p["id"] in known:
            continue
        seen.add(p["id"])
        try:
            pub = datetime.fromisoformat(p["published"].replace("Z", "+00:00"))
        except ValueError:
            continue
        if pub < since:
            continue
        sc = score(p)
        if sc >= args.min_score:
            cands.append((sc, pub, p))
    cands.sort(key=lambda x: (-x[0], x[1]))

    if not cands:
        print(f"no candidates in the last {args.days} days (checked {len(papers)} papers, {len(known)} already listed)")
        return 0

    lines = [
        f"{len(cands)} new astro-ph.CO paper(s) from the last {args.days} days look relevant to the expansion-history site. "
        "Tick the ones to add, then run `python3 scripts/new_paper.py <id>` and fill in the numbers.",
        "",
    ]
    for sc, pub, p in cands:
        first = p["authors"][0] if p["authors"] else "?"
        authors = f"{first} et al." if len(p["authors"]) > 2 else ", ".join(p["authors"])
        lines.append(f"- [ ] **[{p['id']}](https://arxiv.org/abs/{p['id']})** {p['title']}  ")
        lines.append(f"      {authors} · {pub.date()} · score {sc}")
        lines.append(f"      <details><summary>abstract</summary>{p['abstract'][:900]}{'…' if len(p['abstract']) > 900 else ''}</details>")
    md = "\n".join(lines) + "\n"
    if args.out:
        args.out.write_text(md, encoding="utf-8")
        print(f"wrote {args.out} ({len(cands)} candidates)")
    else:
        print(md)
    return 0


if __name__ == "__main__":
    sys.exit(main())
