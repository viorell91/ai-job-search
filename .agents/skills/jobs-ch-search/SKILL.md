---
name: jobs-ch-search
version: 1.0.0
description: >
  Use this skill to search live job listings on jobs.ch, the largest general job
  board in Switzerland, or to look up a specific jobs.ch posting. Covers every
  sector (IT, engineering, pharma, life sciences, finance, consulting, admin)
  across Zürich, Basel, Bern, Zug, Lausanne, Genf and the rest of the country.
  Trigger phrases: find a job in Switzerland, Swiss job search, jobs in Zurich,
  jobs in Basel, jobs in Zug, Stellenangebote, Stelleninserate, Jobsuche Schweiz,
  offene Stellen, Arbeit finden Schweiz, emploi Suisse, offres d'emploi,
  look up this jobs.ch posting.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/jobs-ch-search/cli/src/cli.ts *)
---

# jobs.ch Search Skill

Search live job listings from **[jobs.ch](https://www.jobs.ch)** — the largest general
job board in Switzerland. No authentication, no API key, and **zero runtime
dependencies** — it runs with just `bun`.

This is the **P1 market portal** for this repo (see [`markets.md`](../../../markets.md)).

## Access and terms

jobs.ch's `robots.txt` **disallows `/api/` and `/api_proxy/`** for `User-agent: *`.
The JSON endpoints that back the site are therefore off-limits, and this skill
**deliberately does not touch them**. It reads the public search and detail *pages*,
which are not disallowed, and parses the `schema.org` JSON-LD that jobs.ch embeds in
every one of them.

The detail path this CLI uses — `/de/stellenangebote/detail/<uuid>/` — is allowed.
(`robots.txt` disallows only the deeper `/detail/*/*/*` variants.)

**Personal use only.** Keep request volume low — this is a job search, not a crawler.
The CLI backs off on 429/5xx rather than hammering.

## When to use this skill

- Search Swiss job openings by keyword and city/canton
- Filter to recently posted roles
- Get the full description, workload, employment type and apply link for a posting

## Commands

### Search job listings

```bash
bun run .agents/skills/jobs-ch-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keywords. German **or** English both work; Swiss
  pharma, life-sciences and tech employers post in English constantly, so do not
  assume a German-only query set.
- `--location <text>` / `-l <text>` — city, canton or region: `"Zürich"`, `"Basel"`,
  `"Zug"`, `"Bern"`. Umlauts work; omit the flag to search all of Switzerland.
- `--jobage <days>` — posted within N days. Any positive integer; jobs.ch takes a
  plain day count rather than fixed buckets.
- `--page <n>` — page number (1-indexed, 20 results per page).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/jobs-ch-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the **UUID** from `search` results (e.g. `5cd10373-7316-426d-bc44-8b84a0b59a1d`).
A full `jobs.ch/de/stellenangebote/detail/<uuid>/` URL works too. Returns the
description, company, location, workload, employment type and the apply link.

## Usage examples

```bash
# ML / AI roles in Zürich
bun run .agents/skills/jobs-ch-search/cli/src/cli.ts search -q "machine learning engineer" -l "Zürich" --format table

# NLP roles around Basel, posted in the last two weeks
bun run .agents/skills/jobs-ch-search/cli/src/cli.ts search -q "NLP" -l "Basel" --jobage 14 --format table

# LLM roles nationwide, last week, top 10
bun run .agents/skills/jobs-ch-search/cli/src/cli.ts search -q "LLM engineer" --jobage 7 --limit 10 --format plain

# Second page of data-science roles in Zug
bun run .agents/skills/jobs-ch-search/cli/src/cli.ts search -q "data scientist" -l "Zug" --page 2

# Full details for one posting
bun run .agents/skills/jobs-ch-search/cli/src/cli.ts detail 5cd10373-7316-426d-bc44-8b84a0b59a1d --format plain
```

## Output shape

```json
{
  "meta": { "count": 20, "page": 1 },
  "results": [
    {
      "id": "b99dcbb5-78d8-4998-a152-df9e9f26f26e",
      "title": "Scientist Peptidwirkstoffe R&D LPPS/TAPS (a), 100%",
      "company": "Bachem AG",
      "companyUrl": "https://www.jobs.ch/de/firmen/1351-1351-bachem-ag/",
      "location": "Bubendorf",
      "date": "2026-07-10T18:47:40+02:00",
      "employmentType": "Festanstellung",
      "workload": "100%",
      "url": "https://www.jobs.ch/de/stellenangebote/detail/b99dcbb5-78d8-4998-a152-df9e9f26f26e/"
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

- **Parsing strategy.** Results come from the page's `schema.org` `ItemList` /
  `JobPosting` JSON-LD, not from CSS classes. jobs.ch ships Panda-CSS utility class
  names that change on every deploy; the JSON-LD is stable. `url-reference.md` records
  the field paths.
- **`location` needs both sources.** JSON-LD carries `addressLocality` for only about
  half the results; the rest fall back to the rendered card, anchored on the
  screen-reader label (`Arbeitsort:` / `Work location:` / `Lieu de travail:`).
- **React comment separators.** The rendered markup contains `Arbeitsort<!-- -->:` —
  React separates adjacent text nodes with an empty HTML comment. The parser strips
  comments before matching labels. Any new card-level regex must do the same, or it
  will match nothing while unit tests on hand-written fixtures still pass.
- **Keyword search is loose.** jobs.ch matches broadly across the posting body, so
  `-q "NLP"` can surface unrelated chemistry roles. Expect to filter, and prefer
  multi-word role titles over acronyms.
- **`date` is a full ISO timestamp** with a Swiss offset (`2026-07-20T13:32:10+02:00`),
  not a bare date.
- **German locale is pinned.** All requests go through `/de/`, so labels and
  `employmentType` come back in German (`Festanstellung`). The label matcher also
  accepts the English and French forms in case the locale is ever switched.
- **Swiss work permits.** jobs.ch results are Swiss roles; an EU citizen still needs a
  B or G (cross-border) permit. `/rank` should not score these as permit-free — see
  `markets.md`.
