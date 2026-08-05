// Data source: jobscout24.ch public HTML pages (German locale).
//
// Two different shapes, so two different strategies:
//
//   search — the results list carries NO schema.org payload. It is plain,
//            semantic server-rendered HTML (`<li class="job-list-item"
//            data-job-id="...">`), which parses cleanly by chunking on the list
//            item and reading its child elements.
//   detail — the single-posting page DOES embed a full schema.org JobPosting,
//            including `baseSalary`, so detail reads that instead of the markup.
//
// Location filtering is not a query parameter. The site's search form POSTs with
// an ASP.NET `__RequestVerificationToken`; the GET route ignores `location=`,
// `SearchWhere=` and `Region=` entirely (verified — result sets stayed ~90%
// identical). What does work is the public city route `/de/jobs-in-<city>/`,
// which composes with `?q=`. That is what `--location` builds.

export const ORIGIN = "https://www.jobscout24.ch"
export const SEARCH_PATH = "/de/jobs/"
export const DETAIL_PATH = "/de/job"

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
  location: string | null
  date: string | null
  workload: string | null
  promoted: boolean
  url: string
}

export interface JobDetail extends JobCard {
  description: string | null
  employmentType: string | null
  industry: string | null
  category: string | null
  postalCode: string | null
  region: string | null
  salaryMin: number | null
  salaryMax: number | null
  salaryCurrency: string | null
  salaryUnit: string | null
}

/* -------------------------------------------------------------------------- */
/* Text helpers                                                                */
/* -------------------------------------------------------------------------- */

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

function clean(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
}

/**
 * Flatten an HTML description to readable text, preserving paragraph and list
 * breaks. Deliberately does not collapse all whitespace — that would flatten
 * the posting into a single unreadable paragraph.
 */
export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "\n• ")
    .replace(/<\/(p|li|ul|ol|div|h\d|tr)>/gi, "\n")
  return decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, " "))
    .replace(/[ \t ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/* -------------------------------------------------------------------------- */
/* URL building                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Turn a keyword or city name into a route slug.
 * "Zürich" -> "z%C3%BCrich", "Machine Learning" -> "machine-learning".
 */
export function slugify(text: string): string {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}-]/gu, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
  return encodeURIComponent(slug)
}

/**
 * Build the search path.
 *
 * Search on this portal is **path-based, not query-string based**. The `?q=`
 * parameter looks plausible and returns HTTP 200, but it is ignored outright —
 * `/de/jobs/?q=machine+learning` comes back full of nursing vacancies. The real
 * keyword search lives in the URL path, and it composes with the city:
 *
 *   keyword only   /de/jobs/<keyword>/
 *   keyword + city /de/jobs/<keyword>-in-<city>/
 *   city only      /de/jobs-in-<city>/
 *   neither        /de/jobs/
 *
 * Only pagination (`p`) is a real query parameter.
 */
export function searchPath(query?: string, location?: string): string {
  const kw = query?.trim() ? slugify(query) : ""
  const city = location?.trim() ? slugify(location) : ""
  if (kw && city) return `/de/jobs/${kw}-in-${city}/`
  if (kw) return `/de/jobs/${kw}/`
  if (city) return `/de/jobs-in-${city}/`
  return SEARCH_PATH
}

/* -------------------------------------------------------------------------- */
/* Search-page parsing                                                         */
/* -------------------------------------------------------------------------- */

const PROMO_LABELS = /(top listing|sponsored|gesponsert)/i

/**
 * Parse the results list.
 *
 * Cards are chunked on `<li class="job-list-item"` and parsed independently, so
 * one malformed card cannot break the rest. The same posting can appear more
 * than once per page (a paid slot is rendered again in the organic list), so
 * results are de-duplicated by job id, keeping the first occurrence.
 */
export function parseJobCards(html: string): JobCard[] {
  const results: JobCard[] = []
  const seen = new Set<string>()
  const chunks = html.split(/<li class="job-list-item/i).slice(1)

  for (const chunk of chunks) {
    const id = chunk.match(/data-job-id="(\d+)"/)?.[1]
    if (!id || seen.has(id)) continue

    const detailUrl = chunk.match(/data-job-detail-url="([^"]+)"/)?.[1]
    // Prefer the anchor's title attribute: it holds the untruncated title.
    const title =
      chunk.match(/class="[^"]*job-title[^"]*"[^>]*title="([^"]*)"/i)?.[1] ??
      chunk.match(/class="[^"]*job-title[^"]*"[^>]*>([\s\S]*?)<\/a>/i)?.[1]
    if (!title) continue

    // `job-attributes` is a comma-separated run of spans: company, then place.
    let company: string | null = null
    let location: string | null = null
    const attrs = chunk.match(/<p class="job-attributes">([\s\S]*?)<\/p>/i)?.[1]
    if (attrs) {
      const spans = [...attrs.matchAll(/<span>([\s\S]*?)<\/span>/gi)].map((m) => clean(m[1]))
      const filled = spans.filter((s) => s !== "")
      if (filled.length > 0) company = filled[0]
      if (filled.length > 1) location = filled[filled.length - 1]
    }

    const tags = [...chunk.matchAll(/<span class="tag tag-readonly[^"]*">([\s\S]*?)<\/span>/gi)].map(
      (m) => clean(m[1]),
    )
    const promoted = tags.some((t) => PROMO_LABELS.test(t))
    // A workload tag is the one containing a percentage.
    const workload = tags.find((t) => /%/.test(t)) ?? null

    seen.add(id)
    results.push({
      id,
      title: decodeHtmlEntities(title).trim(),
      company,
      location,
      // The list shows a "New" badge rather than a date; the real datePosted
      // only exists on the detail page. Null here is expected, not a failure.
      date: null,
      workload,
      promoted,
      url: detailUrl ? `${ORIGIN}${detailUrl}` : `${ORIGIN}${DETAIL_PATH}/${id}/`,
    })
  }
  return results
}

/* -------------------------------------------------------------------------- */
/* Detail-page parsing                                                         */
/* -------------------------------------------------------------------------- */

interface LdObject {
  "@type"?: string
  [k: string]: unknown
}

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
  if (typeof v === "string") return v.trim() !== "" ? v.trim() : null
  // employmentType arrives as an array, e.g. ["FULL_TIME"].
  if (Array.isArray(v)) {
    const parts = v.filter((x): x is string => typeof x === "string" && x.trim() !== "")
    return parts.length > 0 ? parts.join(", ") : null
  }
  return null
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

export function parseJobDetail(html: string, fallbackId: string): JobDetail | null {
  const posting = extractLdJson(html).find((o) => o["@type"] === "JobPosting")
  if (!posting) return null

  const address = asRecord(asRecord(posting.jobLocation).address)
  const org = asRecord(posting.hiringOrganization)
  const salary = asRecord(posting.baseSalary)
  const salaryValue = asRecord(salary.value)
  const description = str(posting.description)

  return {
    id: fallbackId,
    title: str(posting.title) ?? "(untitled)",
    company: str(org.name),
    location: str(address.addressLocality),
    date: str(posting.datePosted),
    workload: null,
    promoted: false,
    url: `${ORIGIN}${DETAIL_PATH}/${fallbackId}/`,
    description: description ? htmlToText(description) : null,
    employmentType: str(posting.employmentType),
    industry: str(posting.industry),
    category: str(posting.occupationalCategory),
    postalCode: str(address.postalCode),
    region: str(address.addressRegion),
    salaryMin: num(salaryValue.minValue),
    salaryMax: num(salaryValue.maxValue),
    salaryCurrency: str(salary.currency),
    salaryUnit: str(salaryValue.unitText),
  }
}

/** Accept a numeric job id, a detail UUID, or a full jobscout24 detail URL. */
export function normalizeId(input: string): string | null {
  const uuid = input.match(
    /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/,
  )
  if (uuid) return uuid[0]
  const numeric = input.match(/(?:^|\/)(\d{5,})(?:\/|$)/)
  return numeric ? numeric[1] : null
}
