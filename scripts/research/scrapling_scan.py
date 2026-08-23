#!/usr/bin/env python3
"""
Competitor listing scan, for the market-researcher agent.

Scrapling is used rather than a fixed-selector scraper because marketplace markup
changes constantly and its adaptive matching survives that — a scan written today
keeps working after the next redesign.

    pip install "scrapling[fetchers]"
    scrapling install

    python scripts/research/scrapling_scan.py \
        --url "https://example-marketplace.test/search?q=espresso+cheat+sheet" \
        --niche espresso

Output is JSON on stdout and, with --out, a file under docs/research/raw/.

This is a harness, not a finished scraper: the selectors below are generic and the
agent is expected to adapt them per site. Read the rules at the bottom before
pointing it anywhere.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from dataclasses import dataclass, asdict
from pathlib import Path
from urllib import robotparser
from urllib.parse import urlparse

DEFAULT_DELAY = 3.0  # seconds between requests — be a good citizen
PRICE = re.compile(r"[£$€]\s?(\d+(?:[.,]\d{2})?)")


@dataclass
class Listing:
    title: str
    price_minor: int | None
    currency: str | None
    url: str | None
    pages: int | None
    review_count: int | None


def _require_scrapling():
    try:
        from scrapling.fetchers import StealthyFetcher  # noqa: F401
    except ImportError:
        sys.exit(
            'Scrapling is not installed.\n'
            '  pip install "scrapling[fetchers]" && scrapling install\n'
            "  (vendor/Scrapling has the source if you need the docs)"
        )


def robots_allows(url: str, user_agent: str = "*") -> bool:
    """Never scrape a path the site has asked robots to stay out of."""
    parts = urlparse(url)
    parser = robotparser.RobotFileParser()
    parser.set_url(f"{parts.scheme}://{parts.netloc}/robots.txt")
    try:
        parser.read()
    except Exception:
        # No reachable robots.txt is not permission — fail closed.
        return False
    return parser.can_fetch(user_agent, url)


def to_minor(text: str) -> tuple[int | None, str | None]:
    match = PRICE.search(text or "")
    if not match:
        return None, None
    symbol = match.group(0)[0]
    currency = {"£": "gbp", "$": "usd", "€": "eur"}.get(symbol)
    return int(round(float(match.group(1).replace(",", ".")) * 100)), currency


def first_int(text: str) -> int | None:
    match = re.search(r"\d+", text or "")
    return int(match.group(0)) if match else None


def scan(url: str, limit: int, delay: float) -> list[Listing]:
    _require_scrapling()
    from scrapling.fetchers import StealthyFetcher

    if not robots_allows(url):
        sys.exit(f"robots.txt disallows fetching {url} — stopping.")

    page = StealthyFetcher.fetch(url, headless=True, network_idle=True)
    if page.status >= 400:
        sys.exit(f"{url} returned HTTP {page.status}")

    # Adaptive matching: find the repeated card element rather than a fixed class.
    cards = page.css("[data-listing], li[class*=listing], div[class*=card]")[:limit]

    listings: list[Listing] = []
    for card in cards:
        text = card.get_all_text(strip=True) or ""
        title_el = card.css_first("h1, h2, h3, [class*=title]")
        link_el = card.css_first("a::attr(href)")

        price_minor, currency = to_minor(text)
        pages = None
        if match := re.search(r"(\d+)[\s-]?page", text, re.I):
            pages = int(match.group(1))

        reviews = None
        if match := re.search(r"([\d,]+)\s*(?:reviews?|ratings?)", text, re.I):
            reviews = first_int(match.group(1).replace(",", ""))

        listings.append(
            Listing(
                title=(title_el.get_all_text(strip=True) if title_el else text[:120]),
                price_minor=price_minor,
                currency=currency,
                url=str(link_el) if link_el else None,
                pages=pages,
                review_count=reviews,
            )
        )
        time.sleep(delay)

    return listings


def summarise(listings: list[Listing]) -> dict:
    priced = [l.price_minor for l in listings if l.price_minor]
    paged = [l.pages for l in listings if l.pages]
    return {
        "sampled": len(listings),
        "priced": len(priced),
        "price_minor_low": min(priced) if priced else None,
        "price_minor_high": max(priced) if priced else None,
        "price_minor_median": sorted(priced)[len(priced) // 2] if priced else None,
        "pages_median": sorted(paged)[len(paged) // 2] if paged else None,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url", required=True, help="search results page to sample")
    ap.add_argument("--niche", required=True, help="niche key, used in the output filename")
    ap.add_argument("--limit", type=int, default=20, help="max listings to sample")
    ap.add_argument("--delay", type=float, default=DEFAULT_DELAY, help="seconds between requests")
    ap.add_argument("--out", action="store_true", help="also write to docs/research/raw/")
    args = ap.parse_args()

    listings = scan(args.url, args.limit, args.delay)
    payload = {
        "niche": args.niche,
        "source": args.url,
        "summary": summarise(listings),
        "listings": [asdict(l) for l in listings],
    }

    text = json.dumps(payload, indent=2)
    print(text)

    if args.out:
        out_dir = Path(__file__).resolve().parents[2] / "docs" / "research" / "raw"
        out_dir.mkdir(parents=True, exist_ok=True)
        path = out_dir / f"{args.niche}-{time.strftime('%Y-%m-%d')}.json"
        path.write_text(text, encoding="utf-8")
        print(f"\nwrote {path}", file=sys.stderr)


# Rules for whoever points this at a site:
#   1. robots.txt is checked and honoured above. Do not remove that check.
#   2. Keep the delay. A blocked IP costs more than the data is worth.
#   3. Sample, do not mirror. Twenty listings answers the pricing question.
#   4. Never reuse competitor listing text — this is for prices and gaps only.
#   5. Check vendor/public-apis first; some of this may be available as an API.
if __name__ == "__main__":
    main()
