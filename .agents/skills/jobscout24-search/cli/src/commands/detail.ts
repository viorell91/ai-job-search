import { ORIGIN, DETAIL_PATH, htmlFetch, normalizeId, parseJobDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

function formatSalary(job: {
  salaryMin: number | null
  salaryMax: number | null
  salaryCurrency: string | null
  salaryUnit: string | null
}): string | null {
  if (job.salaryMin === null && job.salaryMax === null) return null
  const currency = job.salaryCurrency ?? ""
  const range =
    job.salaryMin !== null && job.salaryMax !== null
      ? `${job.salaryMin.toLocaleString("de-CH")} – ${job.salaryMax.toLocaleString("de-CH")}`
      : (job.salaryMax ?? job.salaryMin)!.toLocaleString("de-CH")
  return `${currency} ${range}${job.salaryUnit ? ` / ${job.salaryUnit}` : ""}`.trim()
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(
      `Could not parse a jobscout24 job ID from "${opts.id}" (expected a numeric id, a UUID, or a /de/job/<id>/ URL)`,
      "BAD_ID",
    )
    return 1
  }
  try {
    const html = await htmlFetch(`${ORIGIN}${DETAIL_PATH}/${id}/`)
    if (!html) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const job = parseJobDetail(html, id)
    if (!job) {
      writeError("Job page returned no schema.org JobPosting payload", "NOT_FOUND")
      return 1
    }

    if (opts.format === "plain") {
      const salary = formatSalary(job)
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}${job.region ? ` (${job.region})` : ""}`,
        "",
        job.employmentType ? `Employment: ${job.employmentType}` : "",
        salary ? `Salary: ${salary}` : "",
        job.industry ? `Industry: ${job.industry}` : "",
        job.category ? `Category: ${job.category}` : "",
        job.date ? `Posted: ${job.date}` : "",
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
