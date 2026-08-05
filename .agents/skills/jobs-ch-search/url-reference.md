# jobs.ch — endpoint and parsing reference

Everything a maintainer needs when jobs.ch changes its markup. Verified live on
2026-08-05.

## Access constraints (read first)

`https://www.jobs.ch/robots.txt`, `User-agent: *`:

```
Disallow: /api/
Disallow: /api_proxy/
Disallow: /de/stellenangebote/detail/*/*/*
Disallow: /*?*feat=
```

- The JSON API backing the site is **disallowed**. Do not "improve" this skill by
  switching to `/api/...` — that is the one change the robots policy forbids.
- The search page and the single-segment detail path are **allowed**. The disallowed
  detail pattern needs three extra path segments; `/detail/<uuid>/` has one.

## Search

```
GET https://www.jobs.ch/de/stellenangebote/
```

| Parameter | Meaning | Notes |
|---|---|---|
| `term` | Keyword query | German or English. Matches broadly across the posting body. |
| `location` | City / canton / region | Free text. `Basel` narrowed a 1302-hit query to 129. |
| `page` | 1-indexed page | 20 results per page. Omit for page 1. |
| `publication-date` | Max posting age in **days** | Plain integer, not a bucket. Verified monotonic on `term=engineer`: baseline 1604 → `1` 136, `7` 435, `14` 729, `31` 1251, `90` 1471. |

Locale is pinned to `/de/`. `/en/vacancies/` and `/fr/offres-emplois/` mirror it.

### Response structure

The page is React-server-rendered and carries one
`<script type="application/ld+json">` block holding an array of schema.org objects:

| `@type` | Use |
|---|---|
| `WebSite` | ignored |
| `CollectionPage` | `name` holds the total hit count, e.g. `"1302 Machine learning engineer jobs - jobs.ch"` |
| `BreadcrumbList` | ignored |
| `ItemList` | **the results** — `itemListElement[].item` is a `JobPosting` |

`JobPosting` field paths used by the parser:

| Field | Path |
|---|---|
| `id` | `identifier.value` (UUID) |
| `title` | `title` |
| `company` | `hiringOrganization.name` |
| `companyUrl` | `hiringOrganization.sameAs` (jobs.ch company page on search; the employer's own site on detail) |
| `location` | `jobLocation.address.addressLocality`, falling back to `addressRegion` |
| `date` | `datePosted` (ISO 8601 with `+02:00`) |
| `employmentType` | `employmentType` (German, e.g. `Festanstellung`) |
| `url` | `url` |

### Card fallback (location + workload)

`addressLocality` is present on only ~11 of 20 results, so the parser also reads the
rendered cards. Anchors, in order of stability:

1. Card wrapper: `<a data-cy="job-link" id="vacancy-link-<uuid>" href="/de/stellenangebote/detail/<uuid>/">`
2. Inner id echo: `data-cy="serp-item-<uuid>"`
3. Metadata rows: a visually-hidden `<span>` label followed by a `<p>` value.

**The label markup is `Arbeitsort<!-- -->:`,** not `Arbeitsort:`. React separates
adjacent text nodes with an empty HTML comment. Strip comments before matching, or a
`[^<>]`-style label regex silently matches zero cards. Labels observed:

| German | English | French |
|---|---|---|
| `Arbeitsort:` | `Work location:` | `Lieu de travail:` |
| `Pensum:` | `Workload:` | `Taux d'activité:` |
| `Vertragsart:` | `Contract type:` | — |

Do **not** anchor on the class names (`textStyle_caption1`, `pos_absolute w_1px …`).
These are Panda-CSS utility classes and change between deploys.

## Detail

```
GET https://www.jobs.ch/de/stellenangebote/detail/<uuid>/
```

Two ld+json blocks: `BreadcrumbList` and a single `JobPosting`. Additional fields
beyond the search payload:

| Field | Path | Example |
|---|---|---|
| `description` | `description` | HTML fragment — `<p>`, `<ul>`, `<li>`, `<h1>` |
| `workHours` | `workHours` | `"33.6 - 42 hours/week"` |
| `department` | `employmentUnit.name` | `"Fachverantwortung"` |
| `applyUrl` | `potentialAction.target.urlTemplate` | `…/detail/<uuid>/apply` |
| — | `directApply`, `totalJobOpenings`, `jobStartDate`, `image` | available, not currently surfaced |

`description` is HTML inside a JSON string; render it with `htmlToText()`. Note that
helper must **not** route through `stripTags()`, which collapses all whitespace and
flattens the posting into a single paragraph.

A 404 returns `""` from `htmlFetch` and surfaces as `{"error":"Job not found","code":"NOT_FOUND"}`.
