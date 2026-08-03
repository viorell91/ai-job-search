---
name: startupjobs-search
version: 1.0.0
description: >
  Use this skill to search live job listings on StartupJobs.cz, the Czech
  startup and scale-up job board, or to look up a specific StartupJobs offer.
  Strongest for roles at startups and tech-adjacent companies in Prague and
  Brno — including their business-side openings (finance, controlling,
  operations, sales, marketing) — and most listings quote a salary range.
  Trigger phrases: startup jobs Prague, Czech startup jobs, jobs at startups,
  startupjobs, práce ve startupu, nabídky práce startup, scale-up jobs Brno,
  look up this startupjobs offer.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/startupjobs-search/cli/src/cli.ts *)
---

# StartupJobs.cz Search Skill

Search live job listings from **[StartupJobs.cz](https://www.startupjobs.cz)** — the
Czech startup / scale-up job board — through its public offers API. No authentication,
no API key, zero runtime dependencies.

Secondary **P1 market portal** alongside `jobscz-search` (see
[`markets.md`](../../../markets.md)). Jobs.cz is the broad general board; this one is the
startup end of the same market, where salary transparency is much better.

## Access and terms

`startupjobs.cz/robots.txt` is fully permissive (`Allow: /`, empty `Disallow`) and does
not restrict `/api/`. **Personal use only** — keep request volume low.

## Two real limitations, stated up front

1. **No server-side keyword search.** The API has no working query parameter — every
   candidate (`query`, `search`, `q`, `keyword`, `text`, `fulltext`, `name`,
   `searchQuery`) returns the whole unfiltered set, and the site itself filters in the
   browser. So `--query` is applied **client-side** after paging the API. This is
   affordable because the whole board is only ~410 offers, and each record ships its
   full description, so matching runs against real content rather than titles.
   `search` reports `scannedOffers` and `scanComplete` so a partial scan is never
   presented as exhaustive.
2. **No publication date.** The offer record has no date field of any kind. Every result
   therefore carries `"date": null`, and **`--jobage` is not supported**. If recency
   matters for a given search, prefer `jobscz-search`.

## Commands

### Search job listings

```bash
bun run .agents/skills/startupjobs-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keywords, matched client-side against title, company,
  area tags and the full description. All terms must match; case- and
  diacritic-insensitive (`kontroling` finds `Kontroling`).
- `--location <text>` / `-l <text>` — city, e.g. `"Praha"`, `"Brno"`. **Remote offers
  always match** any location.
- `--remote` — only offers flagged remote.
- `--scan-pages <n>` — how many 20-offer API pages to scan. Default `8` (160 offers),
  max `30`; the board is ~21 pages, and scanning stops early at the last one. Pass
  `--scan-pages 21` for an exhaustive search.
- `--limit <n>` / `-n <n>` — cap results emitted.
- `--format json|table|plain` — default `json`.

### Fetch full offer detail

```bash
bun run .agents/skills/startupjobs-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric offer ID (e.g. `106485`) or a full `startupjobs.cz/nabidka/...` URL.
There is no per-offer endpoint, so `detail` locates the offer by scanning the list API —
it defaults to covering the whole board.

## Usage examples

```bash
# Finance / controlling roles in Prague
bun run .agents/skills/startupjobs-search/cli/src/cli.ts search -q "finance" -l "Praha" --format table

# Exhaustive sweep for controlling roles across the whole board
bun run .agents/skills/startupjobs-search/cli/src/cli.ts search -q "controlling" --scan-pages 21 --format table

# Remote-only openings
bun run .agents/skills/startupjobs-search/cli/src/cli.ts search --remote --format table

# Full details for one offer
bun run .agents/skills/startupjobs-search/cli/src/cli.ts detail 106485 --format plain
```

## Output shape

```json
{
  "meta": { "count": 6, "page": 1, "total": 410, "scannedOffers": 160, "scanComplete": false },
  "results": [
    {
      "id": "106389",
      "title": "Junior Controller @PRAGER'S",
      "company": "PRAGER'S",
      "location": "Praha",
      "date": null,
      "url": "https://www.startupjobs.cz/nabidka/106389/junior-controller",
      "salary": "60,000–100,000 CZK / month",
      "seniority": "junior, medior",
      "areas": "Finance",
      "employmentType": "Full-time",
      "remote": false
    }
  ]
}
```

`detail` additionally returns `description`, `collaboration` (contract forms offered) and
`benefits` when the site provides readable labels.

All errors go to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Notes

- **Salary coverage is good** — a structured `{min, max, measure, currency}` object,
  usually monthly CZK, on a large share of offers. Better than jobs.cz for pay signal.
- **`collaboration` matters in Czechia**: `Pracovní smlouva` (employment contract) versus
  freelance/IČO changes tax and social security entirely — worth weighting in `/rank`.
- Listings skew startup/tech, but the board carries plenty of business-side roles
  (finance, controlling, ops, sales) at those companies.
- `benefits` arrives as bare numeric IDs with no dictionary; the CLI suppresses it rather
  than printing meaningless numbers.
