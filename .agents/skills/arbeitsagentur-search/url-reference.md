# Arbeitsagentur Jobsuche API reference

Reconnaissance notes behind `cli/src/helpers.ts`. Recorded 2026-08-03.

## robots.txt

`https://www.arbeitsagentur.de/robots.txt`:

```
User-agent: *
Disallow:
Allow: /
```

Fully permissive. This skill uses the JSON API rather than the web pages anyway.

## Auth

Every request carries `X-API-Key: jobboerse-jobsuche`. Fixed public client key used by
the portal's own front end — no signup, no account, nothing user-identifying. It is not
a secret and is intentionally committed.

**Transport note:** the host negotiates HTTP/2 badly with some clients (`curl` returns
`PROTOCOL_ERROR (err 1)` unless forced to `--http1.1`). Bun's `fetch` is unaffected.

## Endpoint versions rotate — and search and detail rotate SEPARATELY

**2026-08-03:** search moved `pc/v4/jobs` → `pc/v6/jobs`. `v4` and `v5` now return **404**;
`v1`–`v3` return **403**. Detail did **not** move: `pc/v4/jobdetails` still returns 200,
while `v5`/`v6` jobdetails return 403.

Symptom when this happens: the CLI reports `NOT_FOUND` / `Search endpoint returned no data`
for every query, including ones that worked the day before. Diagnose by curling the version
ladder:

```bash
for p in pc/v4/jobs pc/v5/jobs pc/v6/jobs pc/v7/jobs; do
  printf "%-14s " "$p"
  curl -sS --http1.1 -m 20 -o /dev/null -w "%{http_code}\n" \
    -H "X-API-Key: jobboerse-jobsuche" \
    "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/$p?was=Controlling&wo=Berlin&size=1"
done
```

Then check the response shape before assuming a drop-in swap — v6 renamed everything.

## Search

```
GET https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v6/jobs
```

| Param | Meaning | Notes |
|---|---|---|
| `was` | keywords | German terms match much better than English |
| `wo` | location | city, postcode or region |
| `umkreis` | radius in km | only meaningful with `wo` |
| `veroeffentlichtseit` | posted within N days | **only 1, 7, 14, 28 are honoured** |
| `arbeitszeit` | working time | `vz` full time, `tz` part time, `snw` shift/night/weekend |
| `page` | 1-indexed page | |
| `size` | page size | max 100 |

### `veroeffentlichtseit` is a bucket, not a number

Measured against `maxErgebnisse` for `was=Controlling&wo=Berlin` (540 total):

| Value | Results | Honoured? |
|---|---|---|
| 1 | 9 | yes |
| 3 | 540 | **no — falls back to everything** |
| 7 | 65 | yes |
| 14 | 131 | yes |
| 21 | 540 | **no** |
| 28 | 239 | yes |
| 100 | 540 | **no** |

So the honoured set is `{1, 7, 14, 28}` — the four options in the site's own UI.
The CLI rounds up into that set and drops the filter above 28.

`arbeitszeit`: `vz`→493, `tz`→80, `snw`→2, and `ho`/`mj`→0 (not valid codes; home office
is exposed as a facet and on the detail record, not as this parameter).

### Response (v6 — current)

```
{ ergebnisliste: [...], maxErgebnisse: 553, page, size, woOutput, facetten }
```

**v6 renamed the results array and every field**, and returns the near-complete record
inline (only the free-text description still requires a detail call):

| Meaning | v4 (retired) | v6 (current) |
|---|---|---|
| results array | `stellenangebote` | `ergebnisliste` |
| reference number | `refnr` | `referenznummer` |
| title | `titel` | `stellenangebotsTitel` |
| occupation | `beruf` | `hauptberuf` |
| employer | `arbeitgeber` | `firma` |
| location | `arbeitsort{plz,ort,region,land}` | `stellenlokationen[].adresse{...}` |
| published | `aktuelleVeroeffentlichungsdatum` | `datumErsteVeroeffentlichung` |
| start date | `eintrittsdatum` | `eintrittszeitraum.von` |
| external URL | `externeUrl` | `externeURL` (recased) |

v6 additionally carries `arbeitszeit*` flags, `vertragsdauer`, `verguetungsangabe`,
`homeofficemoeglich`, `alleBerufe[]` and `entfernung` directly on each search result.

**Booleans changed type.** v4 emitted the *strings* `"True"`/`"False"`; v6 emits real JSON
booleans. `bool()` in `helpers.ts` accepts both, so do not "simplify" it to a plain cast.

`toCard()` reads both generations via `??` chains. That is deliberate: it costs almost
nothing and turns a future rotation into missing fields rather than zero results.

## Detail

```
GET https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobdetails/<base64(refnr)>
```

- Still on **v4** as of 2026-08-03, even though search is on v6. `v5`/`v6` jobdetails → 403,
  `v3` → 404, `v2` → 403. Do not "upgrade" this path to match the search version.
- The reference number is base64-encoded in the path. Reference numbers can produce `+`,
  `/` and `=` in base64, all path-significant, so the encoded value is percent-encoded.

Fields consumed: `stellenangebotsTitel`, `stellenangebotsBeschreibung`, `firma`,
`hauptberuf`, `stellenlokationen[0].adresse`, `vertragsdauer`, `verguetungsangabe`,
`homeofficemoeglich`, `istArbeitnehmerUeberlassung`, `eintrittszeitraum.von`,
`datumErsteVeroeffentlichung`, `externeURL`, and the `arbeitszeit*` boolean flags.

### Two JSON quirks

1. **Booleans are strings.** `"True"` / `"False"`, not `true` / `false`.
2. **Absent URLs are the string `"null"`,** not JSON `null` — in both the search and
   detail payloads.

`verguetungsangabe` is usually the sentinel `KEINE_ANGABEN` ("no information"); the CLI
maps that to `null` rather than surfacing the placeholder as if it were pay data.
