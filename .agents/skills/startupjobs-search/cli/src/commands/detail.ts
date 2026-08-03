import { API_URL, apiFetch, parsePage, toDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  scanPages: number
  format: "json" | "plain"
}

/** Accept a bare offer id or any startupjobs URL containing one. */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim()
  if (/^\d{3,}$/.test(trimmed)) return trimmed
  const fromUrl = trimmed.match(/\/nabidk[ay]\/(\d{3,})/i) ?? trimmed.match(/\/job[s]?\/(\d{3,})/i)
  return fromUrl ? fromUrl[1] : null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse an offer ID from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    // There is no per-offer endpoint (/api/offers/<id> redirects to HTML), and
    // the list API already carries each offer's full description — so the
    // offer is located by paging the list rather than fetched individually.
    for (let page = 1; page <= opts.scanPages; page++) {
      const body = await apiFetch(page > 1 ? `${API_URL}?page=${page}` : API_URL)
      if (body === null) break
      const parsed = parsePage(body)
      if (parsed.offers.length === 0) break

      for (const offer of parsed.offers) {
        const o = offer as { id?: unknown }
        if (String(o.id) !== id) continue
        const job = toDetail(offer)
        if (!job) break

        if (opts.format === "plain") {
          const lines = [
            job.title,
            `${job.company || "—"} · ${job.location || "—"}`,
            "",
            job.salary ? `Salary: ${job.salary}` : "",
            job.seniority ? `Seniority: ${job.seniority}` : "",
            job.employmentType ? `Employment: ${job.employmentType}` : "",
            job.collaboration ? `Collaboration: ${job.collaboration}` : "",
            job.areas ? `Areas: ${job.areas}` : "",
            job.remote ? "Remote: yes" : "",
            "",
            job.description || "(no description)",
            "",
            job.benefits ? `Benefits: ${job.benefits}` : "",
            `URL: ${job.url}`,
          ].filter((l) => l !== "")
          process.stdout.write(lines.join("\n") + "\n")
        } else {
          process.stdout.write(JSON.stringify(job, null, 2) + "\n")
        }
        return 0
      }

      if (parsed.maxPage !== null && page >= parsed.maxPage) break
    }

    writeError(
      `Offer ${id} not found in the first ${opts.scanPages} pages (it may have expired)`,
      "NOT_FOUND",
    )
    return 1
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
