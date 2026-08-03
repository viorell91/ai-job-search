---
name: pracuj-search
version: 1.0.0
description: >
  Use this skill to search live job listings on Pracuj.pl, the dominant general
  job board in Poland, or to look up a specific Pracuj.pl offer. Covers every
  sector — finance, controlling, consulting, business services, SSC/BPO,
  administration, IT — across Warsaw, Krakow, Wroclaw, Poznan, Gdansk and the
  rest of the country. Trigger phrases: jobs in Poland, Polish job search, jobs
  in Warsaw, jobs in Krakow, praca, oferty pracy, szukam pracy, ogłoszenia o
  pracę, look up this pracuj.pl offer.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/pracuj-search/cli/src/cli.ts *)
---

# Pracuj.pl Search Skill

Search live job listings from **[Pracuj.pl](https://www.pracuj.pl)** — Poland's largest
general job board. No authentication and no API key.

This is the **P2 market portal** for this repo (see [`markets.md`](../../../markets.md)).

## ⚠️ Requires `curl` on PATH

Unlike every other portal skill here, this one shells out to `curl` instead of using
`fetch`. Pracuj.pl's bot protection rejects Bun's TLS fingerprint with a hard `403` no
matter what headers are sent; curl's is accepted. If `curl` is missing, the CLI says so
explicitly with an install hint. (curl ships with macOS and virtually all Linux distros;
`winget install curl` on Windows.)

## Access and terms

`pracuj.pl/robots.txt` disallows only asset and account paths (`/_styles/`, `/konto/`,
`/_images/`, …). The `/praca` search path and `/praca/<slug>,oferta,<id>` offer pages
are not restricted. **Personal use only** — keep request volume low.

## When to use this skill

- Search Polish job openings by keyword and city
- Filter to recent postings (1 / 3 / 7 / 14 / 30 days) using the site's own filter
- Get the full description, contract type, seniority level and closing date for an offer

## Commands

### Search job listings

```bash
bun run .agents/skills/pracuj-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keywords. **Polish and English both work well** — the
  large SSC/BPO finance employers in Warsaw and Kraków advertise heavily in English.
- `--location <text>` / `-l <text>` — city: `"Warszawa"`, `"Krakow"`, `"Wroclaw"`,
  `"Poznan"`, `"Gdansk"`. The site applies a 30 km radius automatically.
- `--jobage <days>` — posted within N days, mapped onto the site's own period buckets
  (**1, 3, 7, 14, 30**). Values in between round up; above 30 the filter is dropped.
- `--page <n>` — 1-indexed page (50 results per page).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full offer detail

```bash
bun run .agents/skills/pracuj-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric offer ID from `search` results (e.g. `1005003253`), or a full
`pracuj.pl/praca/...,oferta,<id>` URL.

## Usage examples

```bash
# Controlling roles in Warsaw, last 7 days
bun run .agents/skills/pracuj-search/cli/src/cli.ts search -q "controlling" -l "Warszawa" --jobage 7 --format table

# English-language finance roles in Krakow
bun run .agents/skills/pracuj-search/cli/src/cli.ts search -q "financial analyst" -l "Krakow" --format table

# Consulting roles nationwide, second page
bun run .agents/skills/pracuj-search/cli/src/cli.ts search -q "consultant" --page 2

# Full details for one offer
bun run .agents/skills/pracuj-search/cli/src/cli.ts detail 1005003253 --format plain
```

## Output shape

```json
{
  "meta": { "count": 50, "page": 1, "total": 701 },
  "results": [
    {
      "id": "1004986216",
      "title": "Credit Controller",
      "company": "Devire",
      "location": "Warszawa",
      "date": "2026-08-02",
      "url": "https://www.pracuj.pl/praca/credit-controller-warszawa,oferta,1004986216",
      "salary": "13 000–15 000 zł brutto / mies.",
      "contractType": "Umowa o pracę",
      "positionLevel": "Specjalista / Specjalistka (mid / Regular)",
      "workMode": "Praca hybrydowa",
      "remote": true,
      "deadline": "2026-09-01"
    }
  ]
}
```

`detail` additionally returns `description` (the offer's sections joined) and `summary`
(the site's own AI-generated requirement summary, tags stripped).

All errors go to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Notes

- **Parsing is JSON, not HTML.** The CLI reads the site's embedded `__NEXT_DATA__`
  React-Query cache, so a visual restyle of pracuj.pl cannot break it.
- **One listing can cover several cities.** Pracuj groups those into a single offer; the
  CLI takes the ID and URL from the first posting and joins the workplaces into
  `location`. Nationwide postings show as `"Cała Polska"`.
- **`contractType` matters in Poland.** `Umowa o pracę` (employment contract) versus
  `B2B` / `Umowa zlecenie` changes tax, social security and notice entirely — worth
  weighting in `/rank`, not just noting.
- `deadline` comes from the offer's own expiry date, so `/rank` can flag closing roles.
