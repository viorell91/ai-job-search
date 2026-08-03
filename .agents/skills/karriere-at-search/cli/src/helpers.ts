// Data source: karriere.at public search + job pages (no authentication).
//
// Search results are server-rendered `li.m-jobsList__item` cards and are parsed
// with regex. Job detail pages carry a schema.org JSON-LD `JobPosting` block, so
// `detail` parses that instead of the markup — structured, and immune to
// restyling.

export const SEARCH_BASE = "https://www.karriere.at/jobs"
export const DETAIL_BASE = "https://www.karriere.at/jobs"

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
        "Accept-Language": "de-AT,de;q=0.9,en;q=0.8",
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
  url: string
  employmentType: string | null
  /** Austria requires pay disclosure, so most cards carry a salary line. */
  salary: string | null
  homeOffice: boolean
}

export interface JobDetail extends JobCard {
  description: string | null
  region: string | null
  validThrough: string | null
  applyUrl: string | null
}

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

export function clean(html: string): string {
  return decodeHtmlEntities(stripTags(html)).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim()
}

// --- URL building -----------------------------------------------------------

/**
 * karriere.at takes the keyword and the location as **path segments**
 * (`/jobs/financial-analyst/wien`), not query parameters.
 *
 * A `?keywords=` query is accepted only when no keyword segment is present; if
 * a location segment is used with it, the keywords are silently dropped and the
 * whole city's listings come back — so the path form is the only correct one.
 */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
}

// --- German date handling ---------------------------------------------------

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/**
 * Normalise karriere.at's posting-date label to ISO `YYYY-MM-DD`, or null.
 *
 * Observed forms: "Heute veröffentlicht", "Gestern veröffentlicht",
 * "vor 4 Tagen veröffentlicht", and absolute "22.7.2026".
 */
export function normalizeGermanDate(raw: string, today: Date = new Date()): string | null {
  const text = raw.trim().toLowerCase()
  if (!text) return null

  if (text.startsWith("heute")) return isoDate(today)
  if (text.startsWith("gestern")) {
    const d = new Date(today)
    d.setDate(d.getDate() - 1)
    return isoDate(d)
  }

  const rel = text.match(/vor\s+(\d+)\s+tag/)
  if (rel) {
    const d = new Date(today)
    d.setDate(d.getDate() - parseInt(rel[1], 10))
    return isoDate(d)
  }

  const abs = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (abs) {
    return `${abs[3]}-${abs[2].padStart(2, "0")}-${abs[1].padStart(2, "0")}`
  }

  return null
}

/** Whole days between an ISO date and `today`. Null when undatable. */
export function ageInDays(iso: string | null, today: Date = new Date()): number | null {
  if (!iso) return null
  const then = new Date(`${iso}T00:00:00`)
  if (isNaN(then.getTime())) return null
  const ref = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((ref.getTime() - then.getTime()) / 86400000)
}

// --- Parsing ----------------------------------------------------------------

const SALARY_RE = /\d[\d.,]*\s*(?:€|EUR)/i

/** Classify a result-card pill into employment type / home office / salary. */
export function classifyPills(pills: string[]): {
  employmentType: string | null
  salary: string | null
  homeOffice: boolean
} {
  let employmentType: string | null = null
  let salary: string | null = null
  let homeOffice = false

  for (const pill of pills) {
    const p = pill.trim()
    if (!p) continue
    if (/homeoffice/i.test(p)) {
      homeOffice = true
      continue
    }
    if (SALARY_RE.test(p)) {
      salary = salary ?? p
      continue
    }
    if (/vollzeit|teilzeit|geringf|praktikum|lehre|freelan/i.test(p)) {
      employmentType = employmentType ?? p
    }
  }

  return { employmentType, salary, homeOffice }
}

/**
 * Parse the search-results page. Cards are split on the list-item boundary and
 * parsed independently, so one malformed card cannot break the page.
 */
export function parseJobCards(html: string, today: Date = new Date()): JobCard[] {
  const results: JobCard[] = []
  const chunks = html.split(/<li[^>]*class="[^"]*m-jobsList__item[^"]*"[^>]*>/i).slice(1)

  for (const chunk of chunks) {
    const linkMatch = chunk.match(
      /class="[^"]*m-jobsListItem__titleLink[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i,
    )
    if (!linkMatch) continue

    const url = decodeHtmlEntities(linkMatch[1]).split("?")[0]
    const idMatch = url.match(/\/jobs\/(\d+)/)
    if (!idMatch) continue
    const id = idMatch[1]

    const title = clean(linkMatch[2])
    if (!title) continue

    let company: string | null = null
    const companyMatch = chunk.match(
      /class="[^"]*m-jobsListItem__companyName[^"]*"[^>]*>([\s\S]*?)<\/a>/i,
    )
    if (companyMatch) company = clean(companyMatch[1]) || null

    // A posting can list several locations; keep them all, comma separated.
    const locations: string[] = []
    const locRe = /class="[^"]*m-jobsListItem__location"[^>]*>([\s\S]*?)<\/a>/gi
    let lm: RegExpExecArray | null
    while ((lm = locRe.exec(chunk)) !== null) {
      // Each anchor carries a trailing separator span ("Bregenz, ") except the
      // last, so strip any trailing comma *and* the space before it.
      const loc = clean(lm[1]).replace(/\s*,\s*$/, "").trim()
      if (loc) locations.push(loc)
    }

    let date: string | null = null
    const dateMatch = chunk.match(/class="[^"]*m-jobsListItem__date"[^>]*>([\s\S]*?)<\/span>/i)
    if (dateMatch) date = normalizeGermanDate(clean(dateMatch[1]), today)

    const pills: string[] = []
    const pillRe = /class="[^"]*m-jobsListItem__pill"[^>]*>([\s\S]*?)<\/span>/gi
    let pm: RegExpExecArray | null
    while ((pm = pillRe.exec(chunk)) !== null) {
      const text = clean(pm[1])
      if (text) pills.push(text)
    }
    const { employmentType, salary, homeOffice } = classifyPills(pills)

    results.push({
      id,
      title,
      company,
      location: locations.length ? locations.join(", ") : null,
      date,
      url,
      employmentType,
      salary,
      homeOffice,
    })
  }

  return results
}

/** Total match count from the results header ("1.578 Controlling Jobs"). */
export function parseTotalCount(html: string): number | null {
  const m = html.match(/(Mehr als\s*)?([\d.]+)\s+[^<]{0,60}?Jobs/i)
  if (!m) return null
  const n = parseInt(m[2].replace(/\./g, ""), 10)
  return isNaN(n) ? null : n
}

// --- Detail (JSON-LD) -------------------------------------------------------

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null
}

/** Pull the schema.org JobPosting block out of a job page. */
export function extractJobPostingLd(html: string): Record<string, unknown> | null {
  const blockRe = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = blockRe.exec(html)) !== null) {
    let parsed: unknown
    try {
      parsed = JSON.parse(m[1].trim())
    } catch {
      continue // a malformed block must not abort the search for a good one
    }
    const candidates = Array.isArray(parsed) ? parsed : [parsed]
    for (const c of candidates) {
      const rec = asRecord(c)
      if (rec["@type"] === "JobPosting") return rec
    }
  }
  return null
}

function formatSalary(baseSalary: unknown): string | null {
  const bs = asRecord(baseSalary)
  const value = asRecord(bs.value)
  const currency = str(bs.currency) ?? "EUR"
  const unit = str(value.unitText)
  const period = unit === "YEAR" ? "yearly" : unit === "MONTH" ? "monthly" : unit?.toLowerCase() ?? null

  const min = typeof value.minValue === "number" ? value.minValue : null
  const max = typeof value.maxValue === "number" ? value.maxValue : null
  const exact = typeof value.value === "number" ? value.value : null

  const nf = (n: number) => n.toLocaleString("en-US")
  let amount: string | null = null
  if (min !== null && max !== null && min !== max) amount = `${nf(min)}–${nf(max)}`
  else if (min !== null) amount = `from ${nf(min)}`
  else if (exact !== null) amount = nf(exact)
  if (!amount) return null

  return [amount, currency, period].filter(Boolean).join(" ")
}

export function parseJobDetail(html: string, id: string, today: Date = new Date()): JobDetail {
  const ld = extractJobPostingLd(html)
  if (!ld) {
    return {
      id,
      title: "(untitled)",
      company: null,
      location: null,
      date: null,
      url: `${DETAIL_BASE}/${id}`,
      employmentType: null,
      salary: null,
      homeOffice: false,
      description: null,
      region: null,
      validThrough: null,
      applyUrl: null,
    }
  }

  const org = asRecord(ld.hiringOrganization)
  const locations = Array.isArray(ld.jobLocation) ? ld.jobLocation : [ld.jobLocation]
  const firstAddress = asRecord(asRecord(locations[0]).address)

  const employmentType = Array.isArray(ld.employmentType)
    ? ld.employmentType.filter((t): t is string => typeof t === "string").join(", ") || null
    : str(ld.employmentType)

  const rawDescription = str(ld.description)
  let description: string | null = null
  if (rawDescription) {
    const withBreaks = rawDescription
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
    description =
      decodeHtmlEntities(stripTags(withBreaks))
        .replace(/\u00a0/g, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim() || null
  }

  const datePosted = str(ld.datePosted)

  return {
    id,
    title: str(ld.title) ?? "(untitled)",
    company: str(org.name),
    location: str(firstAddress.addressLocality),
    date: datePosted ? datePosted.slice(0, 10) : null,
    url: `${DETAIL_BASE}/${id}`,
    employmentType,
    salary: formatSalary(ld.baseSalary),
    homeOffice: /homeoffice|home\s*office/i.test(rawDescription ?? ""),
    description,
    region: str(firstAddress.addressRegion),
    validThrough: str(ld.validThrough)?.slice(0, 10) ?? null,
    applyUrl: str(ld.url) ?? `${DETAIL_BASE}/${id}`,
  }
}
