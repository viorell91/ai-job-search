// Data source: jobs.cz public search + job-detail pages (no authentication).
// Search returns a server-rendered HTML list of `article.SearchResultCard`
// blocks; detail pages carry stable `data-test="jd-*"` anchors. Both are parsed
// with regex — the anchors are attribute-based and shallow, so a full DOM parser
// buys nothing here (same reasoning as the linkedin-search skill).

export const SEARCH_BASE = "https://www.jobs.cz/prace"
export const DETAIL_BASE = "https://www.jobs.cz/rpd"

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
        "Accept-Language": "cs,en;q=0.9",
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
  /** Application deadline (ISO) when the card advertises one, else null. */
  deadline: string | null
  url: string
}

export interface JobDetail extends JobCard {
  description: string | null
  employmentType: string | null
  salary: string | null
  contact: string | null
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

/**
 * Drop <script>/<style>/<template> blocks. jobs.cz inlines analytics JS inside
 * the job body, and stripTags alone would leave its source in the description.
 */
export function stripScripts(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<template\b[\s\S]*?<\/template>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
}

/**
 * Return the inner HTML of the <div> carrying `data-test="<name>"`, tracking
 * <div> nesting so the slice ends at that element's own closing tag.
 *
 * A lazy `[\s\S]*?</div>` regex stops at the first nested close instead, and a
 * greedy one runs to the end of the document — on this site that swallowed the
 * page footer, the cookie/GDPR modals and the "send by email" dialog into the
 * job description.
 */
export function extractByDataTest(html: string, name: string): string | null {
  const openRe = new RegExp(`<div[^>]*data-test="${name}"[^>]*>`, "i")
  const open = openRe.exec(html)
  if (!open) return null

  let i = open.index + open[0].length
  let depth = 1

  while (depth > 0 && i < html.length) {
    const nextOpen = html.indexOf("<div", i)
    const nextClose = html.indexOf("</div>", i)
    if (nextClose === -1) return null
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++
      i = nextOpen + 4
    } else {
      depth--
      i = nextClose + 6
    }
  }

  return html.slice(open.index + open[0].length, i - 6)
}

export function clean(html: string): string {
  //   is a non-breaking space; jobs.cz uses it liberally inside labels.
  return decodeHtmlEntities(stripTags(html)).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim()
}

// --- Czech date handling ----------------------------------------------------

// jobs.cz renders posting dates in Czech genitive month names ("30. července"),
// or as "dnes" / "včera". Normalising to ISO makes the results comparable with
// the other portal skills and keeps /scrape's dedup stable across runs.
const CZ_MONTHS: Record<string, number> = {
  ledna: 1,
  února: 2,
  unora: 2,
  března: 3,
  brezna: 3,
  dubna: 4,
  května: 5,
  kvetna: 5,
  června: 6,
  cervna: 6,
  července: 7,
  cervence: 7,
  srpna: 8,
  září: 9,
  zari: 9,
  října: 10,
  rijna: 10,
  listopadu: 11,
  prosince: 12,
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function shiftDays(from: Date, days: number): string {
  const d = new Date(from)
  d.setDate(d.getDate() + days)
  return isoDate(d)
}

/**
 * Normalise a Czech posting-date label to ISO `YYYY-MM-DD`, or null when the
 * label carries no posting date.
 *
 * Handles the forms jobs.cz actually emits: a bare "30. července", and the
 * "Aktualizováno"/"Přidáno" prefixes in front of "dnes"/"včera"/a date.
 * Returns null (not the raw string) for non-date badges, so the `date` field
 * never carries something that isn't a date.
 */
export function normalizeCzechDate(raw: string, today: Date = new Date()): string | null {
  let text = raw.trim().toLowerCase().replace(/ /g, " ")
  if (!text) return null

  // "Aktualizováno včera", "Přidáno dnes", "Aktualizováno 30. července"
  text = text.replace(/^(aktualizov[áa]no|p[řr]id[áa]no|zve[řr]ejn[řě]no)\s+/i, "")

  if (text.startsWith("dnes")) return isoDate(today)
  if (text.startsWith("včera") || text.startsWith("vcera")) return shiftDays(today, -1)

  const m = text.match(/^(\d{1,2})\.\s*([a-záčďéěíňóřšťúůýž]+)/i)
  if (!m) return null
  const day = parseInt(m[1], 10)
  const month = CZ_MONTHS[m[2]]
  if (!month) return null

  // Postings carry no year. Assume the most recent occurrence: if the resulting
  // date lands in the future, it belongs to last year.
  let year = today.getFullYear()
  const candidate = new Date(year, month - 1, day)
  if (candidate.getTime() > today.getTime() + 86400000) year -= 1
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

/**
 * jobs.cz reuses one status slot for three different things: the posting date,
 * an application deadline ("Končí za 3 dny"), and a promo badge
 * ("Příležitost dne"). Split them so `/rank` can flag closing deadlines and the
 * date field stays trustworthy.
 */
export function parseStatusLabel(
  raw: string,
  today: Date = new Date(),
): { date: string | null; deadline: string | null } {
  const text = raw.trim().replace(/ /g, " ")
  if (!text) return { date: null, deadline: null }

  const lower = text.toLowerCase()

  if (/^kon[čc][íi]/.test(lower)) {
    if (/dnes/.test(lower)) return { date: null, deadline: isoDate(today) }
    if (/z[íi]tra/.test(lower)) return { date: null, deadline: shiftDays(today, 1) }
    const m = lower.match(/za\s+(\d+)\s*(hodin|hodiny|hodinu|den|dny|dn[ůu]|dn[íi])/)
    if (m) {
      const n = parseInt(m[1], 10)
      // Anything measured in hours still closes today.
      const days = m[2].startsWith("hodin") ? 0 : n
      return { date: null, deadline: shiftDays(today, days) }
    }
    return { date: null, deadline: null }
  }

  // Promotional badge, not a date ("Příležitost dne" = opportunity of the day).
  if (/^p[řr][íi]le[žz]itost/.test(lower)) return { date: null, deadline: null }

  return { date: normalizeCzechDate(text, today), deadline: null }
}

/**
 * Map a job age in days to jobs.cz's `date` parameter.
 * The portal accepts exactly three buckets — `24h`, `3d`, `7d`. Any other value
 * is silently ignored by the site (it returns the unfiltered result set), so
 * anything above 7 days returns null and the filter is omitted entirely.
 */
export function jobageToDateParam(days: number): string | null {
  if (!days || days <= 0) return null
  if (days <= 1) return "24h"
  if (days <= 3) return "3d"
  if (days <= 7) return "7d"
  return null
}

/**
 * Convert a city/region name to the slug jobs.cz uses in its search path
 * (`/prace/praha/`, `/prace/ceske-budejovice/`): lowercase, diacritics folded,
 * non-alphanumerics collapsed to single hyphens.
 */
export function localitySlug(location: string): string {
  return location
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

// --- Parsing ----------------------------------------------------------------

/**
 * Parse the search-results page. We split on the result-card article boundary
 * and parse each chunk independently, so one malformed card cannot break the
 * rest of the page.
 */
export function parseJobCards(html: string, today: Date = new Date()): JobCard[] {
  const results: JobCard[] = []
  const chunks = html.split(/<article[^>]*class="[^"]*SearchResultCard[^"]*"/i).slice(1)

  for (const chunk of chunks) {
    const idMatch = chunk.match(/data-jobad-id="(\d+)"/)
    if (!idMatch) continue
    const id = idMatch[1]

    // The title is duplicated as an attribute on the <h2>, which is already
    // plain text — more reliable than re-parsing the anchor's inner markup.
    let title: string | null = null
    const attrTitle = chunk.match(/data-test-ad-title="([^"]*)"/)
    if (attrTitle) title = decodeHtmlEntities(attrTitle[1]).trim()
    if (!title) {
      const link = chunk.match(/class="[^"]*SearchResultCard__titleLink[^"]*"[^>]*>([\s\S]*?)<\/a>/i)
      if (link) title = clean(link[1])
    }
    if (!title) continue

    const hrefMatch = chunk.match(/href="(https:\/\/www\.jobs\.cz\/rpd\/[^"]+)"/i)
    const url = hrefMatch
      ? decodeHtmlEntities(hrefMatch[1]).split("?")[0]
      : `${DETAIL_BASE}/${id}/`

    // Company sits in a footer <li> as a `translate="no"` span.
    let company: string | null = null
    const companyMatch = chunk.match(/<span[^>]*translate="no"[^>]*>([\s\S]*?)<\/span>/i)
    if (companyMatch) company = clean(companyMatch[1]) || null

    let location: string | null = null
    const locMatch = chunk.match(/data-test="serp-locality"[^>]*>([\s\S]*?)<\/li>/i)
    if (locMatch) location = clean(locMatch[1]) || null

    let date: string | null = null
    let deadline: string | null = null
    const statusMatch = chunk.match(/data-test-ad-status="[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
    if (statusMatch) {
      const raw = clean(statusMatch[1])
      if (raw) ({ date, deadline } = parseStatusLabel(raw, today))
    }

    results.push({ id, title, company, location, date, deadline, url })
  }

  return results
}

/** Parse a single job-detail page. */
export function parseJobDetail(rawHtml: string, id: string): JobDetail {
  const html = stripScripts(rawHtml)
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  const title = h1 ? clean(h1[1]) : "(untitled)"

  // Info items carry a leading label ("Společnost X", salary, employment type).
  const infoItems: string[] = []
  // Capture the element's *content* only — starting the group after the opening
  // tag's closing `>`, otherwise the tag's own attributes land in the text.
  const itemRe = /data-test="jd-info-item"[^>]*>([\s\S]{0,4000}?)<\/div>/gi
  let im: RegExpExecArray | null
  while ((im = itemRe.exec(html)) !== null) {
    const text = clean(im[1])
    if (text) infoItems.push(text)
  }

  let company: string | null = null
  const companyItem = infoItems.find((t) => /^Spole[čc]nost\s+/i.test(t))
  if (companyItem) company = companyItem.replace(/^Spole[čc]nost\s+/i, "").trim() || null

  const locMatch = html.match(/data-test="jd-info-location"[^>]*>([\s\S]*?)<\/a>/i)
  const location = locMatch ? clean(locMatch[1]) || null : null

  // Anchor on "<digits> <currency>" rather than a \b-delimited currency word:
  // JS \b is ASCII-only, so it never fires after the "č" in "Kč".
  const salary = infoItems.find((t) => /\d[\d\s\u00a0]*(K[čc]|CZK|EUR)/i.test(t)) ?? null
  const employmentType =
    infoItems
      .find((t) => /úvazek|uvazek|pln[ýy]|částe[čc]n|zkr[áa]cen|brig[áa]d/i.test(t))
      ?.replace(/^Typ pracovn[íi]ho pom[ěe]ru\s+/i, "")
      .trim() ?? null

  // Body: the posting's rich text. Keep block boundaries as newlines.
  let description: string | null = null
  const intro = extractByDataTest(html, "jd-header-text")
  const body = extractByDataTest(html, "jd-body-richtext")
  const rawBody = [intro, body].filter(Boolean).join("\n")
  if (rawBody) {
    const withBreaks = rawBody
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
    description =
      decodeHtmlEntities(stripTags(withBreaks))
        .replace(/\u00a0/g, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim() || null
  }

  const contactMatch = html.match(/data-test="jd-contact-company"[^>]*>([\s\S]*?)<\/a>/i)
  const contact = contactMatch ? clean(contactMatch[1]) || null : null

  return {
    id,
    title,
    company,
    location,
    date: null,
    deadline: null,
    url: `${DETAIL_BASE}/${id}/`,
    description,
    employmentType,
    salary,
    contact,
    applyUrl: `${DETAIL_BASE}/${id}/`,
  }
}

/** Total match count reported by the results page ("Našli jsme <strong>152</strong>"). */
export function parseTotalCount(html: string): number | null {
  const m = html.match(/Na[šs]li jsme\s*<strong>([\d\s ]+)<\/strong>/i)
  if (!m) return null
  const n = parseInt(m[1].replace(/[\s ]/g, ""), 10)
  return isNaN(n) ? null : n
}
