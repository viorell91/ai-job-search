# jobscout24.ch — endpoint and parsing reference

Everything a maintainer needs when JobScout24 changes its markup. Verified live on
2026-08-05.

## Access constraints

`https://www.jobscout24.ch/robots.txt`, `User-agent: *` disallows `/app/`,
`/aspnet_client/`, `/careers/`, `/companies/`, `/exportfeed/`, `/statistics/`,
`/JS24Web/` and the per-locale `account/`, `apply/`, `cookies/`, `customer/` paths.

The search listing and `/de/job/<id>/` detail pages are **not** disallowed.

## Search — path-based, not query-based

**The `?q=` parameter does not work.** It returns HTTP 200 and is then ignored:
`/de/jobs/?q=machine+learning` came back full of nursing and medical vacancies.
Likewise `location=`, `SearchWhere=` and `Region=` on the GET route left result sets
~90% identical to baseline. The site's real form is a **POST** to `/de/jobs/search/`
carrying an ASP.NET `__RequestVerificationToken`; this skill does not use it.

What does work is the public path routing:

| Intent | Route |
|---|---|
| keyword only | `/de/jobs/<keyword-slug>/` |
| keyword + city | `/de/jobs/<keyword-slug>-in-<city-slug>/` |
| city only | `/de/jobs-in-<city-slug>/` |
| unfiltered | `/de/jobs/` |

Slug rules: lowercase, whitespace → `-`, drop non-alphanumerics, collapse repeats,
then percent-encode (`Zürich` → `z%C3%BCrich`).

| Query parameter | Meaning | Notes |
|---|---|---|
| `p` | 1-indexed page | **`page` is ignored** and silently re-serves page 1. Verified: `p=2` overlapped page 1 by 4/23 (the repeated promo slots); `page=2` overlapped by 24/26. |

There is **no posting-age parameter**. The search form offers only keyword, location,
region and `SortIndex`.

## Search response structure

No schema.org payload on the listing — it is plain semantic server-rendered HTML.

```html
<li class="job-list-item " data-job-id="10287453"
    data-job-detail-url="/de/job/edf7b154-…/" data-offer-id="jbs_0"
    data-view-source="toplisting">
  <div class="upper-line">
    <a href="/de/job/edf7b154-…/" class="job-link-detail job-title"
       title="Stahlbaukonstrukteur (m/w) 80-100%">Stahlbaukonstrukteur (m/w) 80-100%</a>
  </div>
  <p class="job-attributes"> <span>yellowshark</span> , <span>Aarau</span> </p>
  <div class="lower-line new"><div class="job-tags"><ul>
    <li><span class="tag tag-readonly orange"> Top Listing </span></li>
    <li><span class="tag tag-readonly">100%</span></li>
    <li><span class="tag tag-readonly">Personaldienstleister</span></li>
  </ul></div><p class="job-date"> New </p></div>
</li>
```

| Field | Anchor |
|---|---|
| `id` | `data-job-id` (numeric) |
| `url` | `data-job-detail-url` (UUID path) |
| `title` | the `title=` attribute on `.job-title` — the element text is truncated, the attribute is not |
| `company` | first `<span>` in `p.job-attributes` |
| `location` | last `<span>` in `p.job-attributes` |
| `workload` | the `.tag-readonly` containing `%` (the others are company size/type) |
| `promoted` | a `.tag-readonly` matching `Top Listing` / `Sponsored` |
| `date` | **not available** — `p.job-date` renders a `New` badge, not a date |

**De-duplicate by `data-job-id`.** A paid slot is rendered twice on the same page
(`data-view-source="toplisting"` and again as `"bottomlisting"`); a raw card count of 27
held only 24 distinct postings.

## Detail

```
GET https://www.jobscout24.ch/de/job/<numeric-id-or-uuid>/
```

Both id forms resolve. Unlike the listing, the detail page **does** embed a schema.org
`JobPosting`:

| Field | Path | Example |
|---|---|---|
| `title` | `title` | |
| `description` | `description` | HTML fragment |
| `date` | `datePosted` | `2026-08-05T19:17:00.9730000` (no timezone offset) |
| `location` | `jobLocation.address.addressLocality` | `Aarau` |
| `region` / `postalCode` | `.addressRegion` / `.postalCode` | `AG` / `5000` |
| `employmentType` | `employmentType` | **an array**, e.g. `["FULL_TIME"]` |
| `industry` | `industry` | `Industrie / Produktion` |
| `category` | `occupationalCategory` | |
| `company` | `hiringOrganization.name` | |
| salary | `baseSalary.currency`, `baseSalary.value.{minValue,maxValue,unitText}` | `CHF 75000–90000 / JAHR` |

`employmentType` being a list is why `str()` in `helpers.ts` joins arrays rather than
returning null for them.

`description` is HTML inside a JSON string; render with `htmlToText()`, which must not
route through a whitespace-collapsing tag stripper.
