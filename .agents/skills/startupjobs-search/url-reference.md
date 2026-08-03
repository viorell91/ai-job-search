# startupjobs.cz API reference

Reconnaissance notes behind `cli/src/helpers.ts`. Recorded 2026-08-03.

## robots.txt

```
User-agent: *
Allow: /
Disallow:
```

Fully permissive; `/api/` is not restricted.

## Endpoint

```
GET https://www.startupjobs.cz/api/offers[?page=<n>]
```

Response: `{ resultSet[], resultCount, paginator: { current, max }, permanentUrlForResultSet, seo }`

- Page size is **fixed at 20** — `perPage`, `limit`, `pageSize` and `count` are all ignored.
- The whole board is small: `resultCount` ≈ 410, `paginator.max` = 21.
- There is **no per-offer endpoint**: `/api/offers/<id>` returns a `302` to HTML.

## There is no server-side keyword filter

Every plausible parameter returns the same unfiltered `resultCount` of 410:

`query`, `search`, `q`, `keyword`, `text`, `fulltext`, `name`, `searchQuery`, `areaSlugs`

The site's own search page (`/nabidky?query=...`) renders **zero** offer links
server-side — it is fully client-rendered and filters in the browser.

So this skill filters client-side too. That is a deliberate, affordable choice here
because (a) the corpus is ~410 offers, not millions, and (b) each list record already
carries the **full HTML description**, so matching happens against real content rather
than titles alone.

`search` scans `--scan-pages` pages (default 8 = 160 offers, stopping early at the last
page) and reports `scanComplete` plus `scannedOffers` in its JSON meta, so a partial
scan is never passed off as an exhaustive one. `detail` scans up to the full board,
since it has to locate an offer by id.

## There is no publication date

The offer record has no date-like field at all — checked for `date`, `created`,
`published` variants; none exist. Consequently:

- every result carries `"date": null`
- `--jobage` is **not supported** and is not offered as a flag

This is the one field where this portal is weaker than the others in the repo, and it
matters for `/scrape` dedup and recency ranking.

## Offer record

| Field | Notes |
|---|---|
| `id` | numeric |
| `name` | job title (often contains emoji) |
| `description` | **full HTML** description |
| `url` | relative, e.g. `/nabidka/106485/<slug>` |
| `company`, `companyType`, `isStartup` | employer |
| `locations` | a **string**, not an array |
| `shifts` | e.g. `Full-time` |
| `collaborations` | e.g. `Freelance, Pracovní smlouva, On-site, Hybridní forma spolupráce` |
| `seniorities[]` | `junior` / `medior` / `senior` |
| `areaNames[]`, `mainAreaName`, `areaSlugs[]` | job-family tags |
| `isRemote` | boolean |
| `salary` | structured `{ min, max, measure, currency }` — e.g. monthly CZK |
| `benefits[]` | **bare numeric IDs** with no dictionary to resolve them |

`benefits` is deliberately suppressed unless it contains letters: emitting `"8, 19, 20"`
would present opaque IDs as if they were readable benefit names.
