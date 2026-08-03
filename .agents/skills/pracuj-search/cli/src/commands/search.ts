import {
  SEARCH_BASE,
  htmlFetch,
  parseSearchPage,
  jobageToPeriod,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  jobage: number
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

export function buildUrl(opts: SearchOpts): string {
  const params = new URLSearchParams()
  if (opts.query) params.set("kw", opts.query)
  if (opts.location) params.set("wp", opts.location)
  const period = jobageToPeriod(opts.jobage)
  if (period !== null) params.set("et", String(period))
  if (opts.page > 1) params.set("pn", String(opts.page))
  const qs = params.toString()
  return qs ? `${SEARCH_BASE}?${qs}` : SEARCH_BASE
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 42).padEnd(42)
    const company = (c.company || "—").slice(0, 24).padEnd(24)
    const loc = (c.location || "—").slice(0, 22).padEnd(22)
    const pay = (c.salary || "—").slice(0, 22).padEnd(22)
    return `${c.id.padEnd(11)} ${title} ${company} ${loc} ${pay} ${c.date || "—"}`
  })
  const header =
    "ID".padEnd(11) + " " + "TITLE".padEnd(42) + " " + "COMPANY".padEnd(24) + " " +
    "LOCATION".padEnd(22) + " " + "SALARY".padEnd(22) + " POSTED"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const html = await htmlFetch(buildUrl(opts))
    const parsed = parseSearchPage(html, opts.page)
    let cards = parsed.cards
    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.date || "—"}` +
              (c.salary ? `\n  ${c.salary}` : "") +
              (c.remote ? " · remote OK" : "") +
              `\n  id: ${c.id}\n  ${c.url}`,
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
