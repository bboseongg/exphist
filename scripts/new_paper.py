#!/usr/bin/env python3
"""Draft data/papers/<slug>.json from an arXiv id.

    python3 scripts/new_paper.py 2503.14738
    python3 scripts/new_paper.py 2503.14738 --slug desi-dr2-bao-2025

Fills in title, authors, date and a placeholder result from the arXiv
metadata. The numbers, probes and summary are yours to add — the build will
refuse the file until `probes` has at least one entry.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAPERS = ROOT / "data" / "papers"
NS = {"a": "http://www.w3.org/2005/Atom"}

STOP = {"the", "of", "a", "an", "and", "from", "with", "on", "in", "for", "to", "results", "constraints", "cosmological", "measurements", "measurement"}


def fetch(arxiv_id: str) -> dict:
    url = "https://export.arxiv.org/api/query?" + urllib.parse.urlencode({"id_list": arxiv_id})
    req = urllib.request.Request(url, headers={"User-Agent": "expansion-history-site/0.1 (new paper)"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        root = ET.fromstring(resp.read())
    e = root.find("a:entry", NS)
    if e is None or not e.findtext("a:id", default="", namespaces=NS):
        raise SystemExit(f"arXiv id {arxiv_id} not found")
    return {
        "title": " ".join(e.findtext("a:title", default="", namespaces=NS).split()),
        "abstract": " ".join(e.findtext("a:summary", default="", namespaces=NS).split()),
        "published": e.findtext("a:published", default="", namespaces=NS)[:10],
        "authors": [a.findtext("a:name", default="", namespaces=NS) for a in e.findall("a:author", NS)],
        "doi": e.findtext("{http://arxiv.org/schemas/atom}doi", default="") or None,
        "journal": e.findtext("{http://arxiv.org/schemas/atom}journal_ref", default="") or None,
    }


def guess_authors(authors: list[str]) -> str:
    for a in authors:
        if "collaboration" in a.lower():
            return a.strip()
    if not authors:
        return "?"
    last = authors[0].split()[-1]
    return f"{last} et al." if len(authors) > 2 else " & ".join(a.split()[-1] for a in authors)


def guess_slug(title: str, year: str) -> str:
    words = [w for w in re.findall(r"[a-z0-9]+", title.lower()) if w not in STOP][:4]
    return "-".join(words + [year])


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("arxiv_id")
    ap.add_argument("--slug")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    arxiv_id = re.sub(r"^(arxiv:)?", "", args.arxiv_id, flags=re.I).split("v")[0]
    meta = fetch(arxiv_id)
    year = meta["published"][:4]
    slug = args.slug or guess_slug(meta["title"], year)
    out = PAPERS / f"{slug}.json"
    if out.exists() and not args.force:
        raise SystemExit(f"{out} exists (use --force to overwrite)")

    first_sentence = re.split(r"(?<=[.!?])\s", meta["abstract"], maxsplit=1)[0]
    doc = {
        "title": meta["title"],
        "shortName": "TODO short name, e.g. 'DESI DR3 BAO'",
        "authors": guess_authors(meta["authors"]),
        "year": int(year),
        "date": meta["published"],
        "arxiv": arxiv_id,
        **({"doi": meta["doi"]} if meta["doi"] else {}),
        **({"journal": meta["journal"]} if meta["journal"] else {}),
        "probes": [],
        "summary": f"TODO — one or two sentences. Abstract opens: {first_sentence}",
        "status": "unverified",
        "results": [
            {
                "id": "lcdm",
                "label": "TODO, e.g. 'DESI DR3 BAO + BBN (ΛCDM)'",
                "model": "LCDM",
                "datasets": [],
                "params": {},
                "source": "TODO where in the paper, e.g. 'abstract', 'Table 3', 'eq. (12)'",
                "notes": "Fill params with {value, sigma} or {value, plus, minus}: H0, Om, Ok, w, w0, wa, S8, sigma8.",
            }
        ],
    }
    out.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {out}\nnext: fill in probes, shortName, summary and the numbers, then `npm run build`.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
