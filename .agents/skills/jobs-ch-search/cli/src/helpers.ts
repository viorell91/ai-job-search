// Data source: jobs.ch public HTML pages (German locale).
//
// IMPORTANT — why this parses HTML and not the JSON API:
// jobs.ch's robots.txt disallows `/api/` and `/api_proxy/` for `User-agent: *`,
// so the XHR endpoints that back the site are off-limits. The public search and
// detail *pages* are not disallowed, and both embed a complete schema.org
// payload in a <script type="application/ld+json"> block. We read that payload
// instead of scraping CSS classes: it is a stable, documented format, whereas
// jobs.ch ships Panda-CSS utility classes that change on every deploy.
//
// The only thing ld+json does not reliably carry on the search page is the
// city — `addressLocality` is present on roughly half the results. For the rest
// we fall back to the rendered card, anchored on the screen-reader label
// ("Arbeitsort:" / "Work location:" / "Lieu de travail:") rather than on a
// class name, so a restyle does not break it.

export const SEARCH_URL = "https://www.jobs.ch/de/stellenangebote/"
export const DETAIL_URL = "https://www.jobs.ch/de/stellenangebote/detail"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

/** Fetch HTML with exponential backoff on 429/5xx. Returns "" on a 404. */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "de-CH,de;q=0.9,en;q=0.8",
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
    if (response.status === 404) return ""
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }
  throw new Error("Request failed after max retries")
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  companyUrl: string | null
  location: string | null
  date: string | null
  employmentType: string | null
  workload: string | null
  url: string
}

export interface JobDetail extends JobCard {
  description: string | null
  workHours: string | null
  department: string | null
  applyUrl: string | null
}

/* -------------------------------------------------------------------------- */
/* Text helpers                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Convert a Unicode code point to a string. Uses `fromCodePoint` (not
 * `fromCharCode`) so supplementary-plane code points decode correctly, and
 * drops out-of-range values instead of throwing.
 */
function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

/**
 * Remove HTML comments.
 *
 * jobs.ch is React-server-rendered, and React separates adjacent text nodes
 * with an empty comment: the screen-reader label ships as
 * `Arbeitsort<!-- -->:`, not `Arbeitsort:`. Any regex that treats a label as a
 * run of non-`<>` characters silently matches nothing without this.
 */
function stripComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, "")
}

function clean(html: string): string {
  return decodeHtmlEntities(stripTags(html))
}

/**
 * Flatten an HTML description to readable plain text, preserving paragraph and
 * list breaks. jobs.ch descriptions are HTML fragments inside the JSON payload.
 */
export function htmlToText(html: string): string {
  const withBreaks = stripComments(html)
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "\n• ")
    .replace(/<\/(p|li|ul|ol|div|h\d|tr)>/gi, "\n")
  // Deliberately NOT stripTags(): that collapses *all* whitespace, including
  // the newlines just inserted above, and flattens the posting into one wall
  // of text. Strip tags only, then tidy horizontal space and blank runs.
  return decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, " "))
    .replace(/[ \t ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/* -------------------------------------------------------------------------- */
/* schema.org extraction                                                       */
/* -------------------------------------------------------------------------- */

interface LdObject {
  "@type"?: string
  [k: string]: unknown
}

/**
 * Collect every object out of the page's ld+json <script> blocks. Each block
 * may hold a single object or an array; blocks are parsed independently so one
 * malformed block cannot break the rest.
 */
export function extractLdJson(html: string): LdObject[] {
  const out: LdObject[] = []
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1]) as LdObject | LdObject[]
      if (Array.isArray(parsed)) out.push(...parsed)
      else out.push(parsed)
    } catch {
      // Ignore an unparseable block; the others may still be good.
    }
  }
  return out
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {}
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null
}

/** Best available place name: city first, then canton/region. */
function placeFrom(jobLocation: unknown): string | null {
  const address = asRecord(asRecord(jobLocation).address)
  return str(address.addressLocality) ?? str(address.addressRegion) ?? null
}

function mapJobPosting(item: Record<string, unknown>): JobCard | null {
  const id = str(asRecord(item.identifier).value)
  const title = str(item.title)
  const url = str(item.url)
  if (!id || !title) return null
  const org = asRecord(item.hiringOrganization)
  return {
    id,
    title,
    company: str(org.name),
    companyUrl: str(org.sameAs),
    location: placeFrom(item.jobLocation),
    date: str(item.datePosted),
    employmentType: str(item.employmentType),
    workload: null,
    url: url ?? `${DETAIL_URL}/${id}/`,
  }
}

/* -------------------------------------------------------------------------- */
/* Search-page parsing                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Pull label -> value pairs out of the rendered result cards, keyed by job id.
 *
 * Each card is wrapped in `<a data-cy="job-link" id="vacancy-link-<uuid>" ...>`
 * and its metadata rows render as a visually-hidden `<span>Label:</span>`
 * followed by a `<p>` holding the value. Anchoring on that label/value shape
 * keeps this working across locales and across CSS-class churn.
 */
export function parseCardMeta(rawHtml: string): Map<string, Record<string, string>> {
  const meta = new Map<string, Record<string, string>>()
  const html = stripComments(rawHtml)
  const chunks = html.split(/<a[^>]*data-cy="job-link"/i).slice(1)

  for (const chunk of chunks) {
    const idMatch = chunk.match(
      /id="vacancy-link-([0-9a-fA-F-]{36})"/,
    )
    if (!idMatch) continue
    // Stop at the end of this card so we never read the next card's values.
    const card = chunk.split(/<a[^>]*data-cy="job-link"/i)[0]

    const pairs: Record<string, string> = {}
    const pairRe = /<span[^>]*>([^<>]{2,40}?):\s*<\/span>\s*<p[^>]*>([\s\S]*?)<\/p>/gi
    let p: RegExpExecArray | null
    while ((p = pairRe.exec(card)) !== null) {
      const label = clean(p[1]).toLowerCase().replace(/:$/, "")
      const value = clean(p[2])
      if (label && value) pairs[label] = value
    }
    if (Object.keys(pairs).length > 0) meta.set(idMatch[1], pairs)
  }
  return meta
}

const LOCATION_LABELS = /^(arbeitsort|work location|lieu de travail|luogo di lavoro)$/
const WORKLOAD_LABELS = /^(pensum|workload|taux d'activité|grado di occupazione)$/

function pickLabel(
  pairs: Record<string, string> | undefined,
  matcher: RegExp,
): string | null {
  if (!pairs) return null
  for (const [label, value] of Object.entries(pairs)) {
    if (matcher.test(label)) return value
  }
  return null
}

/**
 * Parse a search-results page into job cards.
 *
 * Primary source is the schema.org ItemList; the rendered cards only fill in
 * the city and workload, which the JSON payload omits for many postings.
 */
export function parseJobCards(html: string): JobCard[] {
  const objects = extractLdJson(html)
  const itemList = objects.find((o) => o["@type"] === "ItemList")
  const elements = Array.isArray(itemList?.itemListElement)
    ? (itemList!.itemListElement as unknown[])
    : []

  const cardMeta = parseCardMeta(html)
  const results: JobCard[] = []

  for (const element of elements) {
    const item = asRecord(asRecord(element).item)
    const card = mapJobPosting(item)
    if (!card) continue
    const pairs = cardMeta.get(card.id)
    card.location = card.location ?? pickLabel(pairs, LOCATION_LABELS)
    card.workload = pickLabel(pairs, WORKLOAD_LABELS)
    results.push(card)
  }
  return results
}

/* -------------------------------------------------------------------------- */
/* Detail-page parsing                                                         */
/* -------------------------------------------------------------------------- */

export function parseJobDetail(html: string, fallbackId: string): JobDetail | null {
  const posting = extractLdJson(html).find((o) => o["@type"] === "JobPosting")
  if (!posting) return null

  const base = mapJobPosting(posting as Record<string, unknown>)
  const id = base?.id ?? fallbackId
  const org = asRecord(posting.hiringOrganization)

  const rawDescription = str(posting.description)
  const applyTarget = asRecord(asRecord(posting.potentialAction).target)

  return {
    id,
    title: base?.title ?? "(untitled)",
    company: str(org.name),
    companyUrl: str(org.sameAs),
    location: placeFrom(posting.jobLocation),
    date: str(posting.datePosted),
    employmentType: str(posting.employmentType),
    workload: null,
    url: str(posting.url) ?? `${DETAIL_URL}/${id}/`,
    description: rawDescription ? htmlToText(rawDescription) : null,
    workHours: str(posting.workHours),
    department: str(asRecord(posting.employmentUnit).name),
    applyUrl: str(applyTarget.urlTemplate),
  }
}

/* -------------------------------------------------------------------------- */
/* Misc                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * jobs.ch takes a plain day count in `publication-date`. Values scale
 * monotonically (verified live: 1 -> 136, 7 -> 435, 31 -> 1251 hits for the
 * same query), so no bucketing is needed. Return null to leave the filter off.
 */
export function jobageParam(days: number): string | null {
  if (!days || days <= 0 || days >= 9999) return null
  return String(Math.floor(days))
}

/** Accept a raw UUID, a jobs.ch detail URL, or an /apply URL. */
export function normalizeId(input: string): string | null {
  const m = input.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/)
  return m ? m[0] : null
}
