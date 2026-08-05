---
name: jobscout24-search
version: 1.0.0
description: >
  Use this skill to search live job listings on JobScout24 (jobscout24.ch), one
  of the two large general job boards in Switzerland, or to look up a specific
  JobScout24 posting. Covers every sector across Zürich, Basel, Bern, Aarau,
  Luzern, St. Gallen and the rest of the country, and many postings quote a
  salary range. Trigger phrases: Swiss job search, jobs in Switzerland, jobs in
  Basel, jobs in Zurich, jobscout24, Stellenangebote Schweiz, Stellenmarkt,
  offene Stellen, Jobsuche, Lohn Schweiz, look up this jobscout24 posting.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/jobscout24-search/cli/src/cli.ts *)
---

# JobScout24 Search Skill

Search live job listings from **[jobscout24.ch](https://www.jobscout24.ch)** — a large
general job board in Switzerland. No authentication, no API key, and **zero runtime
dependencies** — it runs with just `bun`.

This is a **P1 market portal** for this repo, used as a second net alongside
`jobs-ch-search` (see [`markets.md`](../../../markets.md)).

## Access and terms

JobScout24's `robots.txt` disallows `/app/`, `/careers/`, `/companies/`, `/exportfeed/`,
`/statistics/` and the per-locale `account/`, `apply/`, `customer/` paths. **None of
those are touched by this skill** — it reads the public search listing and the public
job-detail pages only.

**Personal use only.** Keep request volume low — this is a job search, not a crawler.
The CLI backs off on 429/5xx rather than hammering.

## When to use this skill

- Search Swiss job openings by keyword and city
- Get the full description, employment type and **salary band** for a posting
- Cross-check a `jobs-ch-search` result against a second Swiss board

## Commands

### Search job listings

```bash
bun run .agents/skills/jobscout24-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keywords. German or English both work.
- `--location <text>` / `-l <text>` — Swiss city: `"Basel"`, `"Zürich"`, `"Bern"`.
- `--jobage <days>` — **not supported by this portal** (see Notes). Accepted for
  interface compatibility; the JSON `meta` reports `jobageApplied: false` so a caller
  can tell the filter did not apply.
- `--page <n>` — page number (1-indexed, ~25 results per page).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/jobscout24-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric job id from `search` results (e.g. `10287453`). A detail UUID or a
full `jobscout24.ch/de/job/...` URL works too. Returns the description, company,
location, employment type, industry, category and salary band.

## Usage examples

```bash
# ML / AI roles in Basel
bun run .agents/skills/jobscout24-search/cli/src/cli.ts search -q "machine learning" -l "Basel" --format table

# Software engineering in Zürich
bun run .agents/skills/jobscout24-search/cli/src/cli.ts search -q "software engineer" -l "Zürich" --format table

# Data science nationwide, top 10
bun run .agents/skills/jobscout24-search/cli/src/cli.ts search -q "data scientist" --limit 10 --format plain

# Second page of Python roles in Bern
bun run .agents/skills/jobscout24-search/cli/src/cli.ts search -q "python" -l "Bern" --page 2

# Full details, including the salary band
bun run .agents/skills/jobscout24-search/cli/src/cli.ts detail 10287453 --format plain
```

## Output shape

```json
{
  "meta": { "count": 25, "page": 1 },
  "results": [
    {
      "id": "10329667",
      "title": "Senior AI Infrastructure & Platform Engineer",
      "company": "Albedis",
      "location": "Basel",
      "date": null,
      "workload": "100%",
      "promoted": false,
      "url": "https://www.jobscout24.ch/de/job/<uuid>/"
    }
  ]
}
```

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning (promoted rows are marked `ad`) |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors go to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Notes

- **Search is path-based, and `?q=` is a decoy.** `/de/jobs/?q=machine+learning` returns
  HTTP 200 and is then *ignored* — the results come back full of unrelated nursing
  vacancies. The real search lives in the URL path, and keyword composes with city:
  `/de/jobs/<keyword>/`, `/de/jobs/<keyword>-in-<city>/`, `/de/jobs-in-<city>/`. The CLI
  builds these; do not "simplify" it back to a query parameter.
- **Pagination is `p`, not `page`.** `page=2` silently returns page 1 again.
- **No posting-age filter exists.** The site's search form exposes only keyword,
  location, region and sort order, and the results list shows a `New` badge instead of a
  date. So `date` is `null` on search results — that is expected, not a parse failure.
  The real `datePosted` is available from `detail`.
- **Promoted listings are flagged.** Paid "Top Listing" / "Sponsored" slots appear at the
  top and are frequently unrelated to the query, and the same posting is rendered again
  in the organic list. Results are de-duplicated by job id, and `promoted: true` marks
  the paid ones so `/rank` can down-weight them.
- **Salary data is a real advantage here.** `baseSalary` (min, max, currency, period) is
  present on many detail pages — jobs.ch does not expose this. Worth pulling before a
  Swiss salary negotiation.
- **Two id forms.** The list uses a numeric id, detail URLs use a UUID; both resolve on
  `/de/job/<id>/`, and the CLI accepts either.
- **Swiss work permits.** An EU citizen still needs a B or G (cross-border) permit —
  `/rank` should not score these as permit-free. See `markets.md`.
