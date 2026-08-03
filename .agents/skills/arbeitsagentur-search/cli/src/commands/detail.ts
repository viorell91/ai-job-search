import { DETAIL_URL, apiFetch, encodeRefnr, parseJobDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

/**
 * Accept a bare reference number (e.g. `12288-4871151490-S`) or any
 * arbeitsagentur.de job URL containing one.
 */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const fromUrl = trimmed.match(/jobdetail\/([^/?#]+)/i)
  if (fromUrl) return decodeURIComponent(fromUrl[1])
  // Reference numbers are alphanumeric with dashes; reject anything URL-ish.
  if (/^[A-Za-z0-9][A-Za-z0-9\-_.]*$/.test(trimmed) && !/^https?:/i.test(trimmed)) return trimmed
  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse a reference number from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const body = await apiFetch(`${DETAIL_URL}/${encodeRefnr(id)}`)
    if (body === null) {
      writeError("Job not found (the posting may have been withdrawn)", "NOT_FOUND")
      return 1
    }
    const job = parseJobDetail(body, id)

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.occupation ? `Occupation: ${job.occupation}` : "",
        job.employmentType ? `Employment: ${job.employmentType}` : "",
        job.contractDuration ? `Contract: ${job.contractDuration}` : "",
        job.startDate ? `Starts: ${job.startDate}` : "",
        job.homeOffice === null ? "" : `Home office: ${job.homeOffice ? "yes" : "no"}`,
        job.salaryInfo ? `Pay: ${job.salaryInfo}` : "",
        job.isTempAgency ? "Note: posting is via a temp-work agency (Arbeitnehmerüberlassung)" : "",
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
        job.externalUrl ? `Employer posting: ${job.externalUrl}` : "",
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
