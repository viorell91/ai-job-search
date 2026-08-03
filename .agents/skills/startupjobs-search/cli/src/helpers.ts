// Data source: startupjobs.cz's public offers API (no authentication).
//
// Important shape difference from the other portal skills: this API has **no
// server-side keyword filter**. Every documented-looking parameter (query,
// search, q, keyword, text, fulltext, name, searchQuery, areaSlugs) returns the
// same unfiltered `resultCount`. The site itself renders zero offers
// server-side and filters in the browser.
//
// So this CLI does the same: it pages through the API and filters client-side.
// That is affordable here precisely because the corpus is small — the whole
// board is roughly 400 offers (21 pages of 20) — and each API record already
// carries the full description, so matching is done on real content rather than
// on a title alone.

export const API_URL = "https://www.startupjobs.cz/api/offers"
export const SITE_BASE = "https://www.startupjobs.cz"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

/** Fetch JSON with exponential backoff on 429/5xx. Returns null on a 404. */
export async function apiFetch(url: string): Promise<unknown | null> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        "Accept-Language": "cs,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
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
    if (response.status === 404) return null
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
  /** Always null — the API exposes no publication date. See SKILL.md. */
  date: null
  url: string
  salary: string | null
  seniority: string | null
  areas: string | null
  employmentType: string | null
  remote: boolean
}

export interface JobDetail extends JobCard {
  description: string | null
  benefits: string | null
  collaboration: string | null
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim() !== "") return v.trim()
  if (typeof v === "number") return String(v)
  return null
}

function joinList(v: unknown): string | null {
  if (Array.isArray(v)) {
    const items = v.map((x) => str(x)).filter((x): x is string => x !== null)
    return items.length ? items.join(", ") : null
  }
  return str(v)
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
}

/** Convert the API's HTML description to readable text, keeping block breaks. */
export function htmlToText(html: string | null): string | null {
  if (!html) return null
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
  return (
    decodeEntities(stripTags(withBreaks))
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim() || null
  )
}

/** Render the API's structured salary object as a readable string. */
export function formatSalary(salary: unknown): string | null {
  const s = asRecord(salary)
  const min = typeof s.min === "number" ? s.min : null
  const max = typeof s.max === "number" ? s.max : null
  const currency = str(s.currency) ?? ""
  const measure = str(s.measure)
  const period = measure === "monthly" ? "/ month" : measure === "hourly" ? "/ hour" : measure ? `/ ${measure}` : ""

  const nf = (n: number) => n.toLocaleString("en-US")
  let amount: string | null = null
  if (min !== null && max !== null && min !== max) amount = `${nf(min)}–${nf(max)}`
  else if (min !== null) amount = `from ${nf(min)}`
  else if (max !== null) amount = `up to ${nf(max)}`
  if (!amount) return null

  return [amount, currency, period].filter((p) => p !== "").join(" ")
}

export function toCard(offer: unknown): JobCard | null {
  const o = asRecord(offer)
  const id = str(o.id)
  const title = str(o.name)
  if (!id || !title) return null

  const rawUrl = str(o.url)
  const url = rawUrl
    ? rawUrl.startsWith("http")
      ? rawUrl
      : `${SITE_BASE}${rawUrl}`
    : `${SITE_BASE}/nabidka/${id}`

  return {
    id,
    title,
    company: str(o.company),
    location: joinList(o.locations),
    date: null,
    url,
    salary: formatSalary(o.salary),
    seniority: joinList(o.seniorities),
    areas: joinList(o.areaNames),
    employmentType: joinList(o.shifts),
    remote: o.isRemote === true,
  }
}

/**
 * The API returns `benefits` as bare numeric IDs (`[8, 19, 20]`) with no
 * dictionary to resolve them, so a joined "8, 19, 20" would be noise dressed up
 * as data. Only surface the field when it actually contains labels.
 */
export function formatBenefits(benefits: unknown): string | null {
  const joined = joinList(benefits)
  if (!joined) return null
  return /[A-Za-zÀ-ž]/.test(joined) ? joined : null
}

export function toDetail(offer: unknown): JobDetail | null {
  const card = toCard(offer)
  if (!card) return null
  const o = asRecord(offer)
  return {
    ...card,
    description: htmlToText(str(o.description)),
    benefits: formatBenefits(o.benefits),
    collaboration: joinList(o.collaborations),
  }
}

export interface Page {
  offers: unknown[]
  totalCount: number | null
  maxPage: number | null
}

export function parsePage(body: unknown): Page {
  const d = asRecord(body)
  const offers = Array.isArray(d.resultSet) ? d.resultSet : []
  const paginator = asRecord(d.paginator)
  return {
    offers,
    totalCount: typeof d.resultCount === "number" ? d.resultCount : null,
    maxPage: typeof paginator.max === "number" ? paginator.max : null,
  }
}

/**
 * Client-side keyword match. Searches the fields a candidate would actually
 * scan: title, company, the offer's area tags, and the full description.
 * All terms must match (AND), case- and diacritic-insensitive.
 */
export function matchesQuery(offer: unknown, query: string | undefined): boolean {
  if (!query || !query.trim()) return true
  const o = asRecord(offer)

  const fold = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()

  const haystack = fold(
    [
      str(o.name) ?? "",
      str(o.company) ?? "",
      joinList(o.areaNames) ?? "",
      str(o.mainAreaName) ?? "",
      htmlToText(str(o.description)) ?? "",
    ].join(" "),
  )

  return query
    .trim()
    .split(/\s+/)
    .every((term) => haystack.includes(fold(term)))
}

/** Client-side location match against the offer's `locations` field. */
export function matchesLocation(offer: unknown, location: string | undefined): boolean {
  if (!location || !location.trim()) return true
  const o = asRecord(offer)
  const fold = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
  // A remote offer is a legitimate match for any location query.
  if (o.isRemote === true) return true
  const locs = fold(joinList(o.locations) ?? "")
  return locs.includes(fold(location.trim()))
}
