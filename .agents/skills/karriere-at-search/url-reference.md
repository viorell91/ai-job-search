# karriere.at URL and parsing reference

Reconnaissance notes behind `cli/src/helpers.ts`. Recorded 2026-08-03.

## robots.txt

`https://www.karriere.at/robots.txt`:

```
User-agent: BLEXBot   -> Disallow: /
User-agent: AhrefsBot -> Disallow: /
User-agent: *         -> Disallow:      (i.e. everything allowed)
```

Only two named SEO crawlers are excluded; generic clients are unrestricted.

## Search

```
https://www.karriere.at/jobs/<keyword-slug>[/<location-slug>][?page=<n>]
```

**Keyword and location are path segments, not query parameters.** Verified against the
reported result totals:

| URL | Total |
|---|---|
| `/jobs/controlling` | 1578 |
| `/jobs/controlling/wien` | 590 |
| `/jobs/financial-analyst` | 76 |
| `/jobs/financial-analyst/wien` | 41 |
| `/jobs?keywords=financial analyst` | 76 (works only with **no** location segment) |
| `/jobs/wien?keywords=financial analyst` | 3638 — **keywords silently dropped**, whole city returned |

That last row is the trap: mixing the query form with a location segment looks like it
worked but quietly ignores the keywords. The CLI only ever emits the path form.

Slugs are lowercased and hyphenated; umlauts are **kept**, not folded (company slugs on
the site are percent-encoded, e.g. `hypo-ober%C3%B6sterreich`).

`?page=<n>` paginates (~19 results per page) and is confirmed to return different IDs.

### No posting-age parameter

None of `days`, `periods`, `date`, `jobFilter`, `employmentTypes`, `remote` change the
result count — the site's filters are not expressible in the URL. `--jobage` is therefore
applied **client-side** against each card's parsed date, and this is stated in `SKILL.md`
rather than pretended away. Cards whose date cannot be parsed are kept, not dropped.

## Search result card

Each result is `<li class="m-jobsList__item">`:

| Field | Anchor |
|---|---|
| url + title | `a.m-jobsListItem__titleLink` (`href` → `karriere.at/jobs/<id>`) |
| id | the numeric segment of that href |
| company | `a.m-jobsListItem__companyName` |
| date | `span.m-jobsListItem__date` |
| location | one or more `a.m-jobsListItem__location` |
| pills | `span.m-jobsListItem__pill` |

Date labels: `Heute veröffentlicht`, `Gestern veröffentlicht`,
`vor N Tagen veröffentlicht`, or an absolute `22.7.2026`.

Each location anchor except the last contains a trailing separator span
(`<span class="…__location--lastComma">, </span>`) *inside* the anchor, which yields
`"Bregenz ,"` if you only strip a trailing comma — the space before it must go too.

Pills are untyped and must be classified by content: `Vollzeit`/`Teilzeit` (employment),
`Homeoffice`, and a salary figure (`ab 4.000 € monatlich`, `55.000 € – 75.000 € jährlich`).

**Austria mandates pay disclosure in job ads**, so a salary pill is present on a large
share of listings — unusual among the portals in this repo and worth using in ranking.

## Detail

```
https://www.karriere.at/jobs/<id>
```

The page embeds a **schema.org `JobPosting` JSON-LD block**, so `detail` parses that
rather than the markup: `title`, `description` (HTML), `datePosted`, `validThrough`,
`employmentType[]`, `jobLocation[].address`, `baseSalary` (structured
`MonetaryAmount` with `minValue`/`maxValue`/`unitText`), `hiringOrganization.name`.

The page carries more than one `ld+json` block (a `BreadcrumbList` too), and a block can
fail to parse, so the extractor iterates all of them and skips bad ones instead of
assuming the first is the posting.
