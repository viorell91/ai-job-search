import {
  SEARCH_URL,
  apiFetch,
  parseSearchResponse,
  jobageToPublishedSince,
  workTimeCode,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  radius?: number
  jobage: number
  worktime?: string
  page: number
  size: number
  limit?: number
  format: "json" | "table" | "plain"
}

export function buildUrl(opts: SearchOpts): string {
  const params = new URLSearchParams()
  if (opts.query) params.set("was", opts.query)
  if (opts.location) params.set("wo", opts.location)
  if (opts.radius !== undefined) params.set("umkreis", String(opts.radius))
  const since = jobageToPublishedSince(opts.jobage)
  if (since !== null) params.set("veroeffentlichtseit", String(since))
  const wt = workTimeCode(opts.worktime)
  if (wt) params.set("arbeitszeit", wt)
  params.set("page", String(opts.page))
  params.set("size", String(opts.size))
  return `${SEARCH_URL}?${params.toString()}`
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 44).padEnd(44)
    const company = (c.company || "—").slice(0, 26).padEnd(26)
    const loc = (c.location || "—").slice(0, 26).padEnd(26)
    return `${(c.id || "").padEnd(22)} ${title} ${company} ${loc} ${c.date || "—"}`
  })
  const header =
    "REFNR".padEnd(22) +
    " " +
    "TITLE".padEnd(44) +
    " " +
    "COMPANY".padEnd(26) +
    " " +
    "LOCATION".padEnd(26) +
    " PUBLISHED"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const body = await apiFetch(buildUrl(opts))
    if (body === null) {
      writeError("Search endpoint returned no data", "NOT_FOUND")
      return 1
    }
    const parsed = parseSearchResponse(body, opts.page)
    let cards = parsed.cards
    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.date || "—"}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify(
          { meta: { count: cards.length, page: opts.page, total: parsed.total }, results: cards },
          null,
          2,
        ) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
