# Jobs.cz URL and parsing reference

Reconnaissance notes behind `cli/src/helpers.ts`. Recorded 2026-08-03 — re-verify if
parsing starts returning empty results.

## robots.txt

`https://www.jobs.cz/robots.txt`, `User-agent: *`:

```
Disallow: /muj/      /asmt/    /api/      /iapi/
Disallow: /status/   /translations/       /js/
Disallow: /nabidky-podle-cv/   /session-log/
Disallow: /prihlasit-se/?ref=  /kontakt/?reportJobAdId=
```

`/prace/` (search) and `/rpd/` (job detail) are **not** disallowed — those are the only
two paths this CLI touches. There is no public JSON API available to unauthenticated
clients (`/api/` is disallowed), so search results are parsed from server-rendered HTML.

## Search

```
https://www.jobs.cz/prace/[<locality-slug>/]?q[]=<keywords>[&date=<bucket>][&page=<n>]
```

| Part | Notes |
|---|---|
| `<locality-slug>` | **Path segment, not a query param.** Lowercase, diacritics folded, hyphenated: `praha`, `brno`, `ceske-budejovice`, `usti-nad-labem`, `jihomoravsky-kraj`. Omit for a nationwide search. |
| `q[]` | Keywords. Must be sent as the literal `q[]` key (URL-encoded `q%5B%5D`). |
| `date` | Posting age. **Only `24h`, `3d`, `7d` are honoured.** Any other value (`1d`, `14d`, `30d`, `1m`) is silently ignored and the full result set comes back — verified by comparing reported totals. |
| `page` | 1-indexed. 30 results per page. Omitted for page 1. |

A `locality[]` query parameter exists in the site's own UI but returns **HTTP 500** for
externally constructed values — use the path segment instead.

Total match count appears as `Našli jsme <strong>152</strong> nabídek`.

## Search result card

Each result is an `<article class="SearchResultCard">`:

| Field | Anchor |
|---|---|
| id | `data-jobad-id="2001351910"` |
| title | `data-test-ad-title="…"` on the `<h2>` (plain text, entity-encoded) |
| url | `href="https://www.jobs.cz/rpd/<id>/?searchId=…"` — tracking params stripped |
| company | `<span translate="no">…</span>` in the footer list |
| location | `<li data-test="serp-locality">…</li>` |
| date / deadline | `<div data-test-ad-status="…">…</div>` — see below |

### The status badge is overloaded

One slot, three meanings. Observed vocabulary over ~150 sampled cards:

| Label | Meaning | Parsed as |
|---|---|---|
| `30. července` | posting date (Czech genitive month) | `date` |
| `Aktualizováno včera`, `Přidáno včera` | relative posting/update date | `date` |
| `Končí za 3 dny`, `Končí za 22 hodin` | application **deadline** | `deadline` |
| `Příležitost dne` | paid promo badge | neither |

Postings never carry a year; a parsed date landing in the future is rolled back one year.

## Detail page

```
https://www.jobs.cz/rpd/<id>/
```

No JSON-LD / `JobPosting` structured data on this page — parsing is from `data-test`
anchors, which are stable:

| Field | Anchor |
|---|---|
| title | `<h1>` |
| company | `data-test="jd-info-item"` whose text starts `Společnost ` |
| location | `data-test="jd-info-location"` (anchor text; includes street address) |
| salary | the `jd-info-item` matching `<digits> Kč/CZK/EUR` |
| employment type | the `jd-info-item` mentioning `úvazek`; the `Typ pracovního poměru` label is stripped |
| intro | `data-test="jd-header-text"` |
| body | `data-test="jd-body-richtext"` |
| contact | `data-test="jd-contact-company"` |

### Two parsing traps on this page

1. **Nested divs.** The body element contains nested `<div>`s, and the page continues
   into a footer, GDPR modals and a "send by email" dialog. A lazy
   `[\s\S]*?</div>` stops far too early and a greedy one swallows all the boilerplate,
   so the extractor tracks `<div>` depth to find the element's own closing tag.
2. **Inline analytics JS.** Hotjar and medallion snippets sit *inside* the job body.
   `<script>`/`<style>` blocks are stripped before any text extraction, otherwise the
   description ends up containing `window.hj(...)` source.

Also note: JS `\b` is ASCII-only, so `/\bKč\b/` never matches — currency detection
anchors on `<digits><space>Kč` instead.

## Not every posting uses the standard template

A minority of jobs.cz ads are hosted on a **client-rendered, employer-branded** page
(`<title>Detail pozice | <Company></title>`) rather than the server-rendered ad above.
Observed on O2 Czech Republic and Skupina ČEZ postings, 2026-08-03.

Symptoms: `HTTP 200`, a noticeably smaller document (~40-50 KB vs ~175 KB), **no `<h1>`**,
and none of the `data-test="jd-*"` anchors. The job body is fetched by JavaScript, so there
is nothing in the HTML to parse — this is not a parser regression, and `search` still
returns these postings correctly with title, company, location and date.

`detail` detects the case and exits with `{"code": "CLIENT_RENDERED"}` rather than emitting
an `(untitled)` record with an empty description, which would look like a successful fetch.
Fall back to a browser or paste the text into `/apply`.
