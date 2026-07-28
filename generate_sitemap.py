#!/usr/bin/env python3
"""
Regenerates sitemap.xml from prompts.json.
Run this any time prompts.json changes, so the sitemap always matches
what's actually in the data file (no stale or missing URLs).

Usage:  python3 generate_sitemap.py
"""
import json
import datetime

DOMAIN = "https://prompt-hub-3t3.pages.dev"
TODAY = datetime.date.today().isoformat()

with open("prompts.json", encoding="utf-8") as f:
    prompts = json.load(f)

# De-duplicate by slug — two prompts sharing a slug resolve to the same
# rendered page, so only one <url> entry should exist for it.
seen_slugs = set()
unique_prompts = []
for p in prompts:
    if p["slug"] not in seen_slugs:
        seen_slugs.add(p["slug"])
        unique_prompts.append(p)

urls = []

# Homepage
urls.append({
    "loc": f"{DOMAIN}/",
    "lastmod": TODAY,
    "changefreq": "daily",
    "priority": "1.0",
})

# One entry per unique prompt
for p in unique_prompts:
    urls.append({
        "loc": f"{DOMAIN}/prompt.html?slug={p['slug']}",
        "lastmod": TODAY,
        "changefreq": "monthly",
        "priority": "0.7",
    })

lines = ['<?xml version="1.0" encoding="UTF-8"?>',
         '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for u in urls:
    lines.append("")
    lines.append("<url>")
    lines.append(f"<loc>{u['loc']}</loc>")
    lines.append(f"<lastmod>{u['lastmod']}</lastmod>")
    lines.append(f"<changefreq>{u['changefreq']}</changefreq>")
    lines.append(f"<priority>{u['priority']}</priority>")
    lines.append("</url>")
lines.append("")
lines.append("</urlset>")

with open("sitemap.xml", "w", encoding="utf-8") as f:
    f.write("\n".join(lines) + "\n")

print(f"sitemap.xml written: {len(urls)} URLs "
      f"({len(prompts) - len(unique_prompts)} duplicate slugs skipped)")
