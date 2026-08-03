// Data source: pracuj.pl public search and offer pages (no authentication).
//
// pracuj.pl is a Next.js app that ships its React-Query cache inside a
// `__NEXT_DATA__` script tag. Both search and detail therefore read *structured
// JSON* out of the page rather than scraping markup — the rendered HTML is
// never parsed for job fields, so restyling the site does not break this CLI.

export const SEARCH_BASE = "https://www.pracuj.pl/praca"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

/**
 * Perform one request via `curl` and return [status, body].
 *
 * Why curl and not `fetch`: pracuj.pl sits behind bot protection that rejects
 * Bun's TLS/HTTP2 client fingerprint with a hard 403 — on every request, with
 * any combination of browser headers (User-Agent, Accept-*, Sec-Fetch-*,
 * Upgrade-Insecure-Requests all tested). curl's fingerprint is accepted and
 * returns 200 consistently. This is the only portal skill in the repo that
 * needs this; the rest use `fetch` directly.
 */
async function curlOnce(url: string): Promise<[number, string]> {
  const proc = Bun.spawn(
    [
      "curl",
      "--silent",
      "--show-error",
      "--location",
      "--compressed",
      "--max-time",
      "25",
      "--user-agent",
      UA,
      "--header",
      "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "--header",
      "Accept-Language: pl,en;q=0.9",
      "--write-out",
      "\n%{http_code}",
      url,
    ],
    { stdout: "pipe", stderr: "pipe" },
  )

  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])

  if (code !== 0) {
    if (code === 127 || /not found/i.test(err)) {
      throw new Error(
        "curl is required by pracuj-search but was not found on PATH. " +
          "Install curl (it ships with macOS and most Linux distros; " +
          "`winget install curl` on Windows).",
      )
    }
    throw new Error(`curl failed (exit ${code}): ${err.trim() || "no stderr"}`)
  }

  // --write-out appended "\n<status>" after the body.
  const split = out.lastIndexOf("\n")
  const status = parseInt(out.slice(split + 1).trim(), 10)
  const body = split === -1 ? out : out.slice(0, split)
  if (isNaN(status)) throw new Error("Could not read HTTP status from curl output")
  return [status, body]
}

/** Fetch HTML with exponential backoff on 429/5xx. Returns "" on a 404. */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const [status, body] = await curlOnce(url)

    if (status === 429 || status >= 500) {
      if (attempt === maxRetries) throw new Error(`Request failed: ${status}`)
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (status === 404) return ""
    if (status < 200 || status >= 300) throw new Error(`Request failed: ${status}`)
    return body
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
  salary: string | null
  contractType: string | null
  positionLevel: string | null
  workMode: string | null
  remote: boolean
  /** Application deadline the offer advertises, ISO. */
  deadline: string | null
}

export interface JobDetail extends JobCard {
  description: string | null
  summary: string | null
}

// --- __NEXT_DATA__ access ---------------------------------------------------

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null
}

function firstString(v: unknown): string | null {
  if (Array.isArray(v)) {
    for (const item of v) {
      const s = str(item)
      if (s) return s
    }
    return null
  }
  return str(v)
}

/** Parse the `__NEXT_DATA__` payload embedded in a pracuj.pl page. */
export function extractNextData(html: string): Record<string, unknown> | null {
  const m = html.match(
    /<script id="__NEXT_DATA__" type="application\/json"[^>]*>([\s\S]*?)<\/script>/i,
  )
  if (!m) return null
  try {
    return asRecord(JSON.parse(m[1]))
  } catch {
    return null
  }
}

/**
 * Pull one entry out of the dehydrated React-Query cache by its queryKey head.
 * The cache is an array and its order is not guaranteed, so entries are matched
 * on the key rather than by index.
 */
export function findQueryData(next: Record<string, unknown>, keyHead: string): unknown {
  const queries = asRecord(asRecord(asRecord(next.props).pageProps).dehydratedState).queries
  if (!Array.isArray(queries)) return null
  for (const q of queries) {
    const rec = asRecord(q)
    const key = rec.queryKey
    if (Array.isArray(key) && key[0] === keyHead) {
      return asRecord(rec.state).data
    }
  }
  return null
}

/** ISO timestamp -> plain ISO date. */
function isoDay(v: unknown): string | null {
  const s = str(v)
  return s ? s.slice(0, 10) : null
}

// --- Search parsing ---------------------------------------------------------

/**
 * Map one `groupedOffers` entry onto the shared card shape.
 *
 * A grouped offer can span several physical postings (one per city); the first
 * `offers[]` entry supplies the canonical URL and workplace, and the remaining
 * workplaces are appended to the location string.
 */
export function toCard(grouped: unknown): JobCard | null {
  const g = asRecord(grouped)
  const offers = Array.isArray(g.offers) ? g.offers.map(asRecord) : []
  const first = offers[0] ?? {}

  const id = str(first.partitionId) ?? (typeof first.partitionId === "number" ? String(first.partitionId) : null)
  const title = str(g.jobTitle)
  const url = str(first.offerAbsoluteUri)
  if (!id || !title || !url) return null

  const workplaces = offers
    .map((o) => str(o.displayWorkplace))
    .filter((w): w is string => w !== null)
  const isWholePoland = offers.some((o) => o.isWholePoland === true)

  return {
    id,
    title,
    company: str(g.companyName),
    location: isWholePoland
      ? "Cała Polska"
      : workplaces.length
        ? Array.from(new Set(workplaces)).join(", ")
        : null,
    date: isoDay(g.lastPublicated),
    url,
    // The site sends an empty string when no salary is advertised.
    salary: str(g.salaryDisplayText),
    contractType: firstString(g.typesOfContract),
    positionLevel: firstString(g.positionLevels),
    workMode: firstString(g.workModes),
    remote: g.isRemoteWorkAllowed === true,
    deadline: isoDay(g.expirationDate),
  }
}

export interface SearchResponse {
  total: number | null
  page: number
  cards: JobCard[]
}

export function parseSearchPage(html: string, page: number): SearchResponse {
  const next = extractNextData(html)
  if (!next) return { total: null, page, cards: [] }

  const data = asRecord(findQueryData(next, "jobOffers"))
  const grouped = Array.isArray(data.groupedOffers) ? data.groupedOffers : []
  const cards = grouped.map(toCard).filter((c): c is JobCard => c !== null)
  const total = typeof data.offersTotalCount === "number" ? data.offersTotalCount : null

  return { total, page, cards }
}

// --- Detail parsing ---------------------------------------------------------

/**
 * Posting-age filter. pracuj.pl exposes a real dictionary for this — its
 * `periods` list is exactly {1, 3, 7, 14, 30} days — so `--jobage` maps onto
 * the `et` parameter server-side rather than being filtered locally.
 */
export function jobageToPeriod(days: number): number | null {
  if (!days || days <= 0) return null
  if (days <= 1) return 1
  if (days <= 3) return 3
  if (days <= 7) return 7
  if (days <= 14) return 14
  if (days <= 30) return 30
  return null
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

/** Join the offer's text sections into one readable description. */
export function buildDescription(offer: Record<string, unknown>): string | null {
  const textSections = Array.isArray(offer.textSections) ? offer.textSections.map(asRecord) : []
  const sections = Array.isArray(offer.sections) ? offer.sections.map(asRecord) : []

  // Section titles live in `sections`, the text in `textSections`; both are
  // keyed by sectionType.
  const titleByType = new Map<string, string>()
  for (const s of sections) {
    const type = str(s.sectionType)
    const title = str(s.title)
    if (type && title) titleByType.set(type, title)
  }

  const parts: string[] = []
  for (const s of textSections) {
    const text = str(s.plainText)
    if (!text) continue
    const type = str(s.sectionType)
    const heading = type ? titleByType.get(type) : null
    // `plainText` usually already opens with the section title; only prepend
    // the heading when it does not, otherwise every section reads twice.
    const needsHeading = heading !== undefined && heading !== null && !text.startsWith(heading)
    parts.push(needsHeading ? `${heading}\n${text}` : text)
  }

  return parts.length ? parts.join("\n\n") : null
}

export function parseDetailPage(html: string, id: string, fallbackUrl: string): JobDetail | null {
  const next = extractNextData(html)
  if (!next) return null

  const offer = asRecord(findQueryData(next, "jobOffer"))
  if (Object.keys(offer).length === 0) return null

  const attrs = asRecord(offer.attributes)
  const publication = asRecord(offer.publicationDetails)

  const workplaces = Array.isArray(attrs.workplaces)
    ? attrs.workplaces.map(asRecord).map((w) => str(w.displayAddress) ?? str(w.city))
    : []
  const locations = workplaces.filter((w): w is string => w !== null)

  const aiSummary = str(offer.aiSummary)

  return {
    id,
    title: str(attrs.jobTitle) ?? "(untitled)",
    company: str(attrs.displayEmployerName) ?? str(attrs.employerName),
    location: locations.length ? Array.from(new Set(locations)).join(", ") : null,
    date: isoDay(publication.lastPublicated),
    url: fallbackUrl,
    salary: str(attrs.salaryDisplayText),
    contractType: firstString(attrs.typesOfContract),
    positionLevel: firstString(attrs.positionLevels),
    workMode: firstString(attrs.workModes),
    remote: attrs.isRemoteWorkAllowed === true,
    deadline: isoDay(publication.expirationDate),
    description: buildDescription(offer) ?? str(attrs.description),
    summary: aiSummary ? stripTags(aiSummary) : null,
  }
}
