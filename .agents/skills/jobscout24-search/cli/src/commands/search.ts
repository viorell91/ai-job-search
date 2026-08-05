import {
  ORIGIN,
  htmlFetch,
  parseJobCards,
  searchPath,
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
  // Keyword and location both live in the path — see searchPath(). `?q=` is a
  // decoy: it returns 200 and is then ignored.
  // Pagination is `p`, not `page` — `page=2` silently returns page 1 again
  // (verified: 24/26 ids identical to page 1).
  if (opts.page > 1) params.set("p", String(opts.page))
  const qs = params.toString()
  return `${ORIGIN}${searchPath(opts.query, opts.location)}${qs ? `?${qs}` : ""}`
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const id = c.id.padEnd(9)
    const title = (c.title || "").slice(0, 44).padEnd(44)
    const company = (c.company || "—").slice(0, 24).padEnd(24)
    const loc = (c.location || "—").slice(0, 18).padEnd(18)
    const load = (c.workload || "—").slice(0, 10).padEnd(10)
    return `${id} ${title} ${company} ${loc} ${load}${c.promoted ? " ad" : ""}`
  })
  const header =
    "ID".padEnd(9) +
    " " +
    "TITLE".padEnd(44) +
    " " +
    "COMPANY".padEnd(24) +
    " " +
    "LOCATION".padEnd(18) +
    " " +
    "WORKLOAD".padEnd(10)
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const html = await htmlFetch(buildUrl(opts))
    let cards = parseJobCards(html)
    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    // The portal has no posting-age filter: its search form exposes only
    // keyword, location, region and sort, and the results list shows a "New"
    // badge instead of a date. Rather than silently dropping --jobage, say so
    // in meta so a caller can tell the filter was not applied.
    const jobageApplied = false
    const jobageRequested = opts.jobage < 9999

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}${c.promoted ? " [ad]" : ""}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.workload || "—"}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify(
          {
            meta: {
              count: cards.length,
              page: opts.page,
              ...(jobageRequested ? { jobageApplied } : {}),
            },
            results: cards,
          },
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
