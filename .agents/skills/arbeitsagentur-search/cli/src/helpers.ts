// Data source: the Bundesagentur für Arbeit "Jobsuche" REST API — the public
// backend behind arbeitsagentur.de/jobsuche. It returns structured JSON, so
// there is no HTML parsing here at all.
//
// Auth: a fixed, public client key sent as `X-API-Key`. It is not a personal
// credential and not a secret — it is the same value the public web client
// ships, and there is no signup, quota account, or user identity behind it.

export const API_ROOT = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service"

// Search and detail are versioned INDEPENDENTLY and do not move together.
// On 2026-08-03 search rotated v4 -> v6 (v4 and v5 both now 404) with renamed
// fields, while jobdetails stayed on v4 (v5/v6 jobdetails return 403).
// Re-probe both separately if results go empty; see url-reference.md.
export const SEARCH_URL = `${API_ROOT}/pc/v6/jobs`
export const DETAIL_URL = `${API_ROOT}/pc/v4/jobdetails`
export const WEB_BASE = "https://www.arbeitsagentur.de/jobsuche/jobdetail"

/** Public client key shipped by the portal's own web front end. Not a secret. */
export const API_KEY = "jobboerse-jobsuche"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

/**
 * Fetch JSON with exponential backoff on 429/5xx. Returns null on 404/403
 * (the API answers 403 for a reference number that no longer resolves).
 */
export async function apiFetch(url: string): Promise<unknown | null> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "X-API-Key": API_KEY,
        "User-Agent": UA,
        Accept: "application/json",
        "Accept-Language": "de,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404 || response.status === 403) return null
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.json()
  }
  throw new Error("Request failed after max retries")
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  /** Occupation classification the portal assigns ("Leiter/in - Controlling"). */
  occupation: string | null
  /** Earliest start date the employer gives, ISO. */
  startDate: string | null
  /** Employer's own posting URL when the ad was syndicated from elsewhere. */
  externalUrl: string | null
}

export interface JobDetail extends JobCard {
  description: string | null
  employmentType: string | null
  contractDuration: string | null
  homeOffice: boolean | null
  salaryInfo: string | null
  isTempAgency: boolean | null
}

/**
 * The detail endpoint takes the reference number base64-encoded in the path.
 * Reference numbers can produce `+` and `/` in standard base64, both of which
 * are path-significant, so the result is percent-encoded.
 */
export function encodeRefnr(refnr: string): string {
  const b64 = btoa(refnr)
  return encodeURIComponent(b64)
}

/**
 * Map a job age in days to the portal's `veroeffentlichtseit` parameter.
 *
 * Only the web UI's four buckets are honoured — 1, 7, 14, 28 days. Other values
 * are accepted by the endpoint but ignored (it returns the unfiltered set), so
 * anything above 28 omits the parameter instead of pretending to filter.
 */
export function jobageToPublishedSince(days: number): number | null {
  if (!days || days <= 0) return null
  if (days <= 1) return 1
  if (days <= 7) return 7
  if (days <= 14) return 14
  if (days <= 28) return 28
  return null
}

/** Working-time filter: the portal's `arbeitszeit` codes. */
export function workTimeCode(mode: string | undefined): string | null {
  switch ((mode || "").toLowerCase()) {
    case "fulltime":
    case "vollzeit":
    case "vz":
      return "vz"
    case "parttime":
    case "teilzeit":
    case "tz":
      return "tz"
    case "shift":
    case "snw":
      return "snw"
    default:
      return null
  }
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null
}

/** The API encodes booleans as the strings "True"/"False". */
function bool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v
  if (typeof v === "string") {
    if (/^true$/i.test(v)) return true
    if (/^false$/i.test(v)) return false
  }
  return null
}

function formatLocation(ort: Record<string, unknown> | undefined): string | null {
  if (!ort) return null
  const city = str(ort.ort)
  const region = str(ort.region)
  const plz = str(ort.plz)
  if (city && region && region.toLowerCase() !== city.toLowerCase()) return `${city}, ${region}`
  if (city && plz) return `${plz} ${city}`
  return city ?? region ?? null
}

/**
 * Map one search-result entry onto the shared card shape.
 *
 * Accepts **both** payload generations, because the two differ in every field
 * name and the endpoint has rotated once already:
 *
 * | field      | v4 (retired)                    | v6 (current)                 |
 * |------------|---------------------------------|------------------------------|
 * | id         | `refnr`                         | `referenznummer`             |
 * | title      | `titel`                         | `stellenangebotsTitel`       |
 * | occupation | `beruf`                         | `hauptberuf`                 |
 * | employer   | `arbeitgeber`                   | `firma`                      |
 * | location   | `arbeitsort`                    | `stellenlokationen[0].adresse` |
 * | published  | `aktuelleVeroeffentlichungsdatum` | `datumErsteVeroeffentlichung` |
 * | start date | `eintrittsdatum`                | `eintrittszeitraum.von`      |
 * | ext. URL   | `externeUrl`                    | `externeURL`                 |
 *
 * Reading both costs a few `??` and means a future rotation back, or a partial
 * rollout serving mixed shapes, degrades to missing fields rather than zero results.
 */
export function toCard(offer: Record<string, unknown>): JobCard | null {
  const id = str(offer.referenznummer) ?? str(offer.refnr)
  const occupation = str(offer.hauptberuf) ?? str(offer.beruf)
  const title = str(offer.stellenangebotsTitel) ?? str(offer.titel) ?? occupation
  if (!id || !title) return null

  // v6 nests the address under stellenlokationen[]; v4 had a flat arbeitsort.
  const locations = Array.isArray(offer.stellenlokationen) ? offer.stellenlokationen : []
  const nested = locations.length
    ? ((locations[0] as Record<string, unknown>).adresse as Record<string, unknown> | undefined)
    : undefined
  const flat = offer.arbeitsort as Record<string, unknown> | undefined

  const externalRaw = str(offer.externeURL) ?? str(offer.externeUrl)

  return {
    id,
    title,
    company: str(offer.firma) ?? str(offer.arbeitgeber),
    location: formatLocation(nested ?? flat),
    date: str(offer.datumErsteVeroeffentlichung) ?? str(offer.aktuelleVeroeffentlichungsdatum),
    url: `${WEB_BASE}/${encodeURIComponent(id)}`,
    occupation,
    startDate:
      str((offer.eintrittszeitraum as Record<string, unknown> | undefined)?.von) ??
      str(offer.eintrittsdatum),
    // The API literally emits the string "null" here when there is no URL.
    externalUrl: externalRaw === "null" ? null : externalRaw,
  }
}

export interface SearchResponse {
  total: number | null
  page: number
  cards: JobCard[]
}

export function parseSearchResponse(body: unknown, page: number): SearchResponse {
  const data = (body ?? {}) as Record<string, unknown>
  // v6 renamed the results array from `stellenangebote` to `ergebnisliste`.
  // Accept either so a rotation does not silently yield zero results.
  const offers = Array.isArray(data.ergebnisliste)
    ? data.ergebnisliste
    : Array.isArray(data.stellenangebote)
      ? data.stellenangebote
      : []
  const cards = offers
    .map((o) => toCard(o as Record<string, unknown>))
    .filter((c): c is JobCard => c !== null)
  const total = typeof data.maxErgebnisse === "number" ? data.maxErgebnisse : null
  return { total, page, cards }
}

function describeEmployment(d: Record<string, unknown>): string | null {
  const parts: string[] = []
  if (bool(d.arbeitszeitVollzeit)) parts.push("Vollzeit")
  if (
    bool(d.arbeitszeitTeilzeitFlexibel) ||
    bool(d.arbeitszeitTeilzeitVormittag) ||
    bool(d.arbeitszeitTeilzeitNachmittag) ||
    bool(d.arbeitszeitTeilzeitAbend)
  ) {
    parts.push("Teilzeit")
  }
  if (bool(d.arbeitszeitSchichtNachtWochenende)) parts.push("Schicht/Nacht/Wochenende")
  if (bool(d.istGeringfuegigeBeschaeftigung)) parts.push("geringfügige Beschäftigung")
  return parts.length ? parts.join(", ") : null
}

export function parseJobDetail(body: unknown, id: string): JobDetail {
  const d = (body ?? {}) as Record<string, unknown>
  const locations = Array.isArray(d.stellenlokationen) ? d.stellenlokationen : []
  const firstLoc = (locations[0] ?? {}) as Record<string, unknown>
  const address = (firstLoc.adresse ?? {}) as Record<string, unknown>

  const salaryRaw = str(d.verguetungsangabe)

  return {
    id,
    title: str(d.stellenangebotsTitel) ?? str(d.hauptberuf) ?? "(untitled)",
    company: str(d.firma),
    location: formatLocation(address),
    date: str(d.datumErsteVeroeffentlichung),
    url: `${WEB_BASE}/${encodeURIComponent(id)}`,
    occupation: str(d.hauptberuf),
    startDate: str((d.eintrittszeitraum as Record<string, unknown> | undefined)?.von),
    externalUrl: str(d.externeURL) === "null" ? null : str(d.externeURL),
    description: str(d.stellenangebotsBeschreibung),
    employmentType: describeEmployment(d),
    contractDuration: str(d.vertragsdauer),
    homeOffice: bool(d.homeofficemoeglich),
    // "KEINE_ANGABEN" is the API's explicit "not stated" — report it as absent.
    salaryInfo: salaryRaw && salaryRaw !== "KEINE_ANGABEN" ? salaryRaw : null,
    isTempAgency: bool(d.istArbeitnehmerUeberlassung),
  }
}
