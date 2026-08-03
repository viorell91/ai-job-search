import {
  API_URL,
  apiFetch,
  parsePage,
  toCard,
  matchesQuery,
  matchesLocation,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  remoteOnly: boolean
  scanPages: number
  limit?: number
  format: "json" | "table" | "plain"
}

export function buildUrl(page: number): string {
  return page > 1 ? `${API_URL}?page=${page}` : API_URL
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 42).padEnd(42)
    const company = (c.company || "—").slice(0, 22).padEnd(22)
    const loc = (c.location || "—").slice(0, 18).padEnd(18)
    const pay = (c.salary || "—").slice(0, 26).padEnd(26)
    return `${c.id.padEnd(8)} ${title} ${company} ${loc} ${pay} ${c.remote ? "remote" : ""}`
  })
  const header =
    "ID".padEnd(8) + " " + "TITLE".padEnd(42) + " " + "COMPANY".padEnd(22) + " " +
    "LOCATION".padEnd(18) + " " + "SALARY".padEnd(26) + " FLAGS"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const matched: unknown[] = []
    let scanned = 0
    let corpusTotal: number | null = null
    let maxPage: number | null = null

    // The API has no keyword filter, so pages are pulled and filtered locally.
    // Scanning stops at the last page or at --scan-pages, whichever comes first.
    for (let page = 1; page <= opts.scanPages; page++) {
      const body = await apiFetch(buildUrl(page))
      if (body === null) break
      const parsed = parsePage(body)
      if (page === 1) {
        corpusTotal = parsed.totalCount
        maxPage = parsed.maxPage
      }
      if (parsed.offers.length === 0) break
      scanned += parsed.offers.length

      for (const offer of parsed.offers) {
        if (!matchesQuery(offer, opts.query)) continue
        if (!matchesLocation(offer, opts.location)) continue
        if (opts.remoteOnly) {
          const o = offer as { isRemote?: unknown }
          if (o.isRemote !== true) continue
        }
        matched.push(offer)
      }

      if (maxPage !== null && page >= maxPage) break
    }

    let cards = matched.map(toCard).filter((c): c is JobCard => c !== null)
    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    const scanComplete = maxPage === null || opts.scanPages >= maxPage

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
      if (!scanComplete) {
        process.stdout.write(
          `\n(scanned ${scanned} of ~${corpusTotal ?? "?"} offers — pass --scan-pages ${maxPage} to cover the whole board)\n`,
        )
      }
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"}` +
              (c.salary ? `\n  ${c.salary}` : "") +
              (c.remote ? " · remote" : "") +
              `\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify(
          {
            meta: {
              count: cards.length,
              page: 1,
              total: corpusTotal,
              scannedOffers: scanned,
              scanComplete,
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
