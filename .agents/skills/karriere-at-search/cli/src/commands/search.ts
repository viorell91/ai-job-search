import {
  SEARCH_BASE,
  htmlFetch,
  parseJobCards,
  parseTotalCount,
  slugify,
  ageInDays,
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
  // Both keyword and location are path segments — see helpers.slugify().
  const segments = [SEARCH_BASE]
  if (opts.query) segments.push(slugify(opts.query))
  if (opts.location) {
    // A location cannot be positioned without a keyword segment ahead of it.
    if (!opts.query) segments.push("")
    segments.push(slugify(opts.location))
  }
  const path = segments.filter((s) => s !== "").join("/")
  return opts.page > 1 ? `${path}?page=${opts.page}` : path
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 42).padEnd(42)
    const company = (c.company || "—").slice(0, 24).padEnd(24)
    const loc = (c.location || "—").slice(0, 20).padEnd(20)
    const pay = (c.salary || "—").slice(0, 24).padEnd(24)
    return `${c.id.padEnd(9)} ${title} ${company} ${loc} ${pay} ${c.date || "—"}`
  })
  const header =
    "ID".padEnd(9) +
    " " +
    "TITLE".padEnd(42) +
    " " +
    "COMPANY".padEnd(24) +
    " " +
    "LOCATION".padEnd(20) +
    " " +
    "SALARY".padEnd(24) +
    " POSTED"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const html = await htmlFetch(buildUrl(opts))
    const total = parseTotalCount(html)
    let cards = parseJobCards(html)

    // karriere.at exposes no posting-age parameter in its URLs, so --jobage is
    // applied client-side from each card's parsed date. Cards whose date could
    // not be parsed are kept rather than silently dropped.
    if (opts.jobage > 0 && opts.jobage < 9999) {
      cards = cards.filter((c) => {
        const age = ageInDays(c.date)
        return age === null || age <= opts.jobage
      })
    }

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
              (c.homeOffice ? " · Homeoffice" : "") +
              `\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify(
          { meta: { count: cards.length, page: opts.page, total }, results: cards },
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
