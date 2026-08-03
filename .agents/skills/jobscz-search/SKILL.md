---
name: jobscz-search
version: 1.0.0
description: >
  Use this skill to search live job listings on Jobs.cz, the dominant general
  job board in the Czech Republic, or to look up a specific Jobs.cz posting.
  Covers every sector (finance, controlling, consulting, business, operations,
  IT, admin) across Prague, Brno, Ostrava and the rest of the country. Trigger
  phrases: find a job in Czech Republic, Czech job search, jobs in Prague, jobs
  in Brno, práce, nabídky práce, volná místa, hledám práci, pracovní nabídky,
  look up this jobs.cz posting.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/jobscz-search/cli/src/cli.ts *)
---

# Jobs.cz Search Skill

Search live job listings from **[Jobs.cz](https://www.jobs.cz)** — the largest general
job board in the Czech Republic (Alma Career group). No authentication, no API key, and
**zero runtime dependencies** — it runs with just `bun`.

This is the **P1 market portal** for this repo (see [`markets.md`](../../../markets.md)).

## Access and terms

Jobs.cz's `robots.txt` **allows** the paths this CLI uses — `/prace/` (search) and
`/rpd/` (job detail). It disallows `/api/`, `/iapi/`, `/muj/`, `/asmt/` and
`/nabidky-podle-cv/`, none of which this skill touches.

Even so: **personal use only.** Keep request volume low — this is a job search, not a
crawler. The CLI backs off on 429/5xx rather than hammering.

## When to use this skill

- Search Czech job openings by keyword and city/region
- Filter to recent postings (24h / 3 days / 7 days)
- Get the full description, salary, employment type and contact for a specific posting

## Commands

### Search job listings

```bash
bun run .agents/skills/jobscz-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keywords. Czech **or** English both work; many
  international employers in Prague/Brno post in English.
- `--location <text>` / `-l <text>` — city or region. Diacritics optional:
  `"Praha"`, `"Brno"`, `"Ceske Budejovice"`, `"Jihomoravsky kraj"` all resolve.
- `--jobage <days>` — posted within N days. **Jobs.cz supports three buckets only:**
  `1` → 24h, `2–3` → 3d, `4–7` → 7d. Above 7 the filter is dropped entirely, because
  the site silently ignores unsupported values and returns everything.
- `--page <n>` — page number (1-indexed, 30 results per page).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/jobscz-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric ad ID from `search` results (e.g. `2001322882`). A full
`jobs.cz/rpd/...` or `jobs.cz/jof/...` URL works too. Returns the description,
company, location, salary band, employment type and the named contact person.

## Usage examples

```bash
# Controlling roles in Prague, last 7 days
bun run .agents/skills/jobscz-search/cli/src/cli.ts search -q "controlling" -l "Praha" --jobage 7 --format table

# English-language finance roles in Brno
bun run .agents/skills/jobscz-search/cli/src/cli.ts search -q "financial analyst" -l "Brno" --format table

# Consulting roles nationwide, second page
bun run .agents/skills/jobscz-search/cli/src/cli.ts search -q "consultant" --page 2

# Full details for one posting
bun run .agents/skills/jobscz-search/cli/src/cli.ts detail 2001322882 --format plain
```

## Output shape

```json
{
  "meta": { "count": 30, "page": 1, "total": 349 },
  "results": [
    {
      "id": "2001322882",
      "title": "SENIOR FINANCIAL CONTROLLING",
      "company": "ARETE Property s.r.o.",
      "location": "Praha – Smíchov",
      "date": "2026-07-31",
      "deadline": null,
      "url": "https://www.jobs.cz/rpd/2001322882/"
    }
  ]
}
```

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors go to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Notes

- **`date` vs `deadline`.** Jobs.cz reuses one badge slot for three different things:
  a posting date (`30. července`), an application deadline (`Končí za 3 dny`), and a
  paid promo label (`Příležitost dne`). The CLI splits them: `date` is the posting
  date in ISO form, `deadline` is an ISO closing date when the ad advertises one, and
  the promo badge yields neither. So a `null` date is not a parse failure.
- Czech month names and `dnes` / `včera` / `Aktualizováno …` are normalised to ISO.
- Page size is fixed at 30 results per page by the site.
- Postings carry no year, so a date that would land in the future is read as last year's.
