import { DETAIL_BASE, htmlFetch, parseJobDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

/** Accept a raw jobs.cz ad ID or any jobs.cz job URL containing one. */
export function normalizeId(input: string): string | null {
  const bare = input.match(/^\d{6,}$/)
  if (bare) return input
  const fromUrl = input.match(/jobs\.cz\/(?:rpd|jof)\/(\d{6,})/i)
  if (fromUrl) return fromUrl[1]
  const anyLong = input.match(/(\d{9,})/)
  if (anyLong) return anyLong[1]
  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse a job ID from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const html = await htmlFetch(`${DETAIL_BASE}/${id}/`)
    if (!html) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const job = parseJobDetail(html, id)

    // Some employers are hosted on a JS-rendered, employer-branded template
    // ("Detail pozice | <Company>") instead of the standard server-rendered ad.
    // Those pages carry no <h1> and no jd-* anchors, so there is nothing to
    // parse. Say so explicitly rather than emitting an "(untitled)" record with
    // an empty description, which reads like a successful fetch.
    if (job.title === "(untitled)" && !job.description) {
      writeError(
        `Posting ${id} uses jobs.cz's client-rendered employer template, which has no ` +
          `server-side content to parse. Open ${DETAIL_BASE}/${id}/ in a browser, or pass ` +
          `the description text directly to /apply.`,
        "CLIENT_RENDERED",
      )
      return 1
    }

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.employmentType ? `Employment: ${job.employmentType}` : "",
        job.salary ? `Salary: ${job.salary}` : "",
        job.contact ? `Contact: ${job.contact}` : "",
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
      ].filter((l) => l !== "")
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
