---
name: arbeitsagentur-search
version: 1.0.0
description: >
  Use this skill to search live job listings in Germany via the Bundesagentur
  für Arbeit (Federal Employment Agency) public job-search API, or to look up a
  specific German posting by reference number. It is the largest job database in
  Germany and covers every sector — finance, controlling, consulting, business,
  administration, engineering, trades. Trigger phrases: jobs in Germany, German
  job search, jobs in Berlin/Munich/Frankfurt, Stellenangebote, Stellensuche,
  Jobbörse, Arbeitsagentur, offene Stellen, Jobsuche Deutschland, look up this
  arbeitsagentur posting.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/arbeitsagentur-search/cli/src/cli.ts *)
---

# Arbeitsagentur (Jobbörse) Search Skill

Search live German job listings from the **Bundesagentur für Arbeit** job board via its
public REST API — the same backend that powers
[arbeitsagentur.de/jobsuche](https://www.arbeitsagentur.de/jobsuche). Structured JSON
in and out, so there is **no HTML scraping** and nothing to re-fix when the site is
restyled. Zero runtime dependencies — it runs with just `bun`.

This is the **P4 market portal** for this repo (see [`markets.md`](../../../markets.md)).

## Access and terms

- `arbeitsagentur.de/robots.txt` is fully permissive: `User-agent: *` / `Disallow:` / `Allow: /`.
- The API takes a fixed `X-API-Key: jobboerse-jobsuche`. This is **not a personal
  credential and not a secret** — it is the public client key the portal's own web front
  end ships. There is no signup, no account, and nothing user-identifying in a request.
- It is a public-sector job database, but still: keep volume sane.

## When to use this skill

- Search German job openings by keyword, city/postcode, and radius
- Filter by posting age or working-time model (full time / part time / shift)
- Get the full description, contract type, start date and home-office flag for a posting

## Commands

### Search job listings

```bash
bun run .agents/skills/arbeitsagentur-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keywords. **German terms match far better** here than
  English ones (`Controlling`, `Finanzbuchhaltung`, `Unternehmensberatung`).
- `--location <text>` / `-l <text>` — city, postcode or region: `"Berlin"`, `"München"`, `"60311"`.
- `--radius <km>` / `-r <km>` — radius around the location.
- `--jobage <days>` — posted within N days. **The portal honours four buckets only:
  1, 7, 14, 28.** In-between values round up to the next bucket; above 28 the filter is
  dropped, because the endpoint accepts other numbers but silently ignores them.
- `--worktime <mode>` — `fulltime`, `parttime` or `shift`.
- `--page <n>` — 1-indexed page. `--size <n>` — results per page (default 25, max 100).
- `--limit <n>` / `-n <n>` — cap results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/arbeitsagentur-search/cli/src/cli.ts detail <refnr|url> [--format json|plain]
```

`refnr` is the reference number from `search` results (e.g. `12288-4871151490-S`), or a
full `arbeitsagentur.de/jobsuche/jobdetail/...` URL.

## Usage examples

```bash
# Controlling roles in Berlin, last 7 days
bun run .agents/skills/arbeitsagentur-search/cli/src/cli.ts search -q "Controlling" -l "Berlin" --jobage 7 --format table

# Consulting roles within 25 km of Munich, full time
bun run .agents/skills/arbeitsagentur-search/cli/src/cli.ts search -q "Unternehmensberatung" -l "München" -r 25 --worktime fulltime

# Finance roles in Frankfurt, second page
bun run .agents/skills/arbeitsagentur-search/cli/src/cli.ts search -q "Finanzanalyst" -l "Frankfurt am Main" --page 2

# Full details for one posting
bun run .agents/skills/arbeitsagentur-search/cli/src/cli.ts detail 12288-4871151490-S --format plain
```

## Output shape

```json
{
  "meta": { "count": 25, "page": 1, "total": 540 },
  "results": [
    {
      "id": "13884-340567-S",
      "title": "Werkstudent Finance & Controlling (m/w/d)",
      "company": "GCN Global Comparison Network GmbH",
      "location": "10405 Berlin",
      "date": "2026-07-27",
      "url": "https://www.arbeitsagentur.de/jobsuche/jobdetail/13884-340567-S",
      "occupation": "Betriebswirt/in - Controlling",
      "startDate": "2026-09-01",
      "externalUrl": null
    }
  ]
}
```

All errors go to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Notes

- **Reference numbers, not numeric IDs.** IDs look like `12288-4871151490-S`. The detail
  endpoint takes them base64-encoded in the path; the CLI handles that for you.
- **Two kinds of employer.** Many listings come from *Personalberatungen* (recruiters) and
  *Arbeitnehmerüberlassung* (temp-work agencies). `detail` exposes `isTempAgency` so
  `/rank` can weight those differently — in Germany that distinction matters.
- **`externalUrl`** points at the employer's own posting when the ad was syndicated. The
  API returns the *string* `"null"` rather than JSON `null` when there is none; the CLI
  normalises that away.
- `salaryInfo` is usually absent — German public postings mostly state `KEINE_ANGABEN`,
  which the CLI reports as `null` rather than echoing the placeholder.
