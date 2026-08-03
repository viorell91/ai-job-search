---
name: karriere-at-search
version: 1.0.0
description: >
  Use this skill to search live job listings on karriere.at, the dominant job
  board in Austria, or to look up a specific karriere.at posting. Covers every
  sector — finance, controlling, consulting, business, administration, IT —
  across Vienna, Linz, Graz, Salzburg, Innsbruck and the rest of Austria.
  Because Austrian law requires pay disclosure in job ads, most results carry a
  salary figure. Trigger phrases: jobs in Austria, Austrian job search, jobs in
  Vienna, Jobs in Wien, Stellenangebote Österreich, Jobsuche Österreich,
  offene Stellen, Arbeit in Wien, look up this karriere.at posting.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/karriere-at-search/cli/src/cli.ts *)
---

# karriere.at Search Skill

Search live job listings from **[karriere.at](https://www.karriere.at)** — Austria's
largest job board. No authentication, no API key, and **zero runtime dependencies** —
it runs with just `bun`.

This is the **P3 market portal** for this repo (see [`markets.md`](../../../markets.md)).

## Access and terms

`karriere.at/robots.txt` excludes only two named SEO crawlers (BLEXBot, AhrefsBot); for
generic user agents it is `Disallow:` — everything allowed.

Still: **personal use only.** Keep request volume low.

## When to use this skill

- Search Austrian job openings by keyword and city/region
- See advertised salary bands directly in search results
- Get the full description, salary range, employment type and closing date for a posting

## Commands

### Search job listings

```bash
bun run .agents/skills/karriere-at-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keywords. German terms match best
  (`Controlling`, `Rechnungswesen`, `Unternehmensberatung`), but English titles
  common in Austrian job ads (`Financial Analyst`, `Consultant`) also work.
- `--location <text>` / `-l <text>` — city or region: `"Wien"`, `"Linz"`, `"Graz"`,
  `"Salzburg"`, `"Innsbruck"`.
- `--jobage <days>` — posted within N days. **Applied client-side**: karriere.at exposes
  no posting-age parameter in its URLs, so this filters the page's own results rather
  than narrowing the query. Cards whose date could not be parsed are kept, not dropped.
- `--page <n>` — 1-indexed page (~19 results per page).
- `--limit <n>` / `-n <n>` — cap results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/karriere-at-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric job ID from `search` results (e.g. `7710443`), or a full
`karriere.at/jobs/...` URL.

## Usage examples

```bash
# Controlling roles in Vienna
bun run .agents/skills/karriere-at-search/cli/src/cli.ts search -q "Controlling" -l "Wien" --format table

# Financial analyst roles in Graz, last week
bun run .agents/skills/karriere-at-search/cli/src/cli.ts search -q "financial analyst" -l "Graz" --jobage 7

# Consulting roles nationwide, second page
bun run .agents/skills/karriere-at-search/cli/src/cli.ts search -q "Unternehmensberatung" --page 2

# Full details for one posting
bun run .agents/skills/karriere-at-search/cli/src/cli.ts detail 7710443 --format plain
```

## Output shape

```json
{
  "meta": { "count": 19, "page": 1, "total": 590 },
  "results": [
    {
      "id": "10026341",
      "title": "Head of Group Controlling (w/m/d)",
      "company": "UBM Development AG",
      "location": "Wien",
      "date": "2026-08-02",
      "url": "https://www.karriere.at/jobs/10026341",
      "employmentType": "Vollzeit",
      "salary": "ab 100.000 € jährlich",
      "homeOffice": true
    }
  ]
}
```

`detail` additionally returns `description`, `region`, `validThrough` (closing date) and
a structured salary string such as `"55,000–75,000 EUR yearly"`.

All errors go to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Notes

- **Salary is unusually well covered here.** Austrian law requires the minimum pay
  (`kollektivvertragliches Mindestgehalt`) to be stated in job ads, so `salary` is
  populated on a large share of listings. `ab X` means "from X" — a floor, not the offer.
- **`detail` parses schema.org JSON-LD**, not markup, so it is resilient to site restyles.
  Search results still come from HTML and are the part to re-check if results go empty.
- Search results for a city can include nearby or multi-location postings; the location
  segment narrows but does not hard-restrict.
- `homeOffice` in search comes from a result pill; in `detail` it is inferred from the
  description text, so treat it as a hint rather than a guarantee.
