# pracuj.pl URL and parsing reference

Reconnaissance notes behind `cli/src/helpers.ts`. Recorded 2026-08-03.

## robots.txt

`https://www.pracuj.pl/robots.txt` disallows only asset and account paths —
`/_styles/`, `/_scripts/`, `/_images/`, `/templates/`, `/_includes/`, `/_files/`,
`/L/`, `/l/`, `/konto/`, `/mpimages/`, `/oferty-loga-firm/` and various
`kompendium-hr` / `e-pracodawcy` file paths.

`/praca` (search) and `/praca/<slug>,oferta,<id>` (offers) are **not** disallowed.

## Transport: this skill shells out to `curl`

pracuj.pl is behind bot protection that rejects **Bun's TLS/HTTP2 client fingerprint**
with a hard `403 Forbidden` on every request. Tested and ruled out as a cause:
`User-Agent`, `Accept`, `Accept-Language`, `Accept-Encoding`, `Upgrade-Insecure-Requests`,
`Cache-Control` and the full `Sec-Fetch-*` set — minimal, current and fully
browser-like header sets all returned 403.

`curl` with nothing but a browser `User-Agent` returns `200` consistently, on both search
and offer pages. So `htmlFetch` here spawns `curl` and parses its status via
`--write-out`, keeping the same exponential-backoff behaviour as the other portals.

This is the **only** portal skill in the repo that needs an external binary. If `curl`
is missing the CLI fails with an explicit install hint rather than a confusing 403.

## Search

```
https://www.pracuj.pl/praca?kw=<keywords>[&wp=<city>][&et=<period>][&pn=<page>]
```

| Param | Meaning | Notes |
|---|---|---|
| `kw` | keywords | Polish or English |
| `wp` | workplace / city | site adds a 30 km radius (`rd=30`) automatically |
| `et` | posting period, in days | dictionary is exactly `{1, 3, 7, 14, 30}` |
| `pn` | page number | 1-indexed, 50 results per page (`rop=50`) |

Verified against `offersTotalCount` for `kw=controlling`: no location → 701;
`wp=Warszawa` → 233; `et=1` → 12.

The `et` vocabulary is not guesswork — the page ships it as a dictionary in its own
cache (`["dictionary","periods","pl"]` → `24h / 3 dni / 7 dni / 14 dni / 30 dni`).

## Parsing: structured JSON, not markup

pracuj.pl is a Next.js app and embeds its React-Query cache in
`<script id="__NEXT_DATA__" type="application/json">`. **No job field is ever read from
rendered HTML**, so a restyle cannot break this skill.

Cache entries are matched on their `queryKey` head, not by array index — the order is
not guaranteed.

### Search: `queryKey[0] === "jobOffers"`

`state.data` → `{ offersTotalCount, groupedOffersTotalCount, groupedOffers[] }`.

Each `groupedOffer`: `jobTitle`, `companyName`, `lastPublicated`, `expirationDate`,
`salaryDisplayText`, `isRemoteWorkAllowed`, `typesOfContract[]`, `positionLevels[]`,
`workModes[]`, `workSchedules[]`, `aiSummary`, and `offers[]`.

**A grouped offer can cover several cities** — one `offers[]` entry per physical posting,
each with its own `partitionId`, `offerAbsoluteUri` and `displayWorkplace`. The card id
and URL come from the first entry; the workplaces are joined. `isWholePoland` marks a
nationwide posting.

`salaryDisplayText` is an **empty string**, not null, when no pay is advertised.

### Detail: `queryKey[0] === "jobOffer"`

`state.data` → `attributes` (jobTitle, displayEmployerName, salaryDisplayText,
typesOfContract, positionLevels, workModes, workplaces), `publicationDetails`
(lastPublicated, expirationDate), `sections[]` (section titles), `textSections[]`
(`sectionType` + `plainText`), and `aiSummary` (HTML).

Section titles live in `sections` and the text in `textSections`, keyed by `sectionType`.
`plainText` usually **already begins with the section title**, so the heading is only
prepended when it does not — otherwise every section reads twice.

The site does not serve an offer from a bare id, but `/praca/x,oferta,<id>` redirects to
the correctly slugged URL, which is how `detail <id>` works.
