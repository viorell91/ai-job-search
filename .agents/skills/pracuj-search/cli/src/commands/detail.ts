import { htmlFetch, parseDetailPage, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

/**
 * Accept a full pracuj.pl offer URL, or a bare numeric offer id.
 *
 * Offer URLs embed a slug (`/praca/<slug>,oferta,<id>`), and the site does not
 * serve an offer from the id alone — so a bare id is resolved through the
 * canonical short form, which redirects to the slugged URL.
 */
export function normalizeTarget(input: string): { id: string; url: string } | null {
  const trimmed = input.trim()

  const fromUrl = trimmed.match(/pracuj\.pl\/praca\/[^,]*,oferta,(\d+)/i)
  if (fromUrl) return { id: fromUrl[1], url: trimmed.split("?")[0] }

  if (/^\d{6,}$/.test(trimmed)) {
    return { id: trimmed, url: `https://www.pracuj.pl/praca/x,oferta,${trimmed}` }
  }

  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const target = normalizeTarget(opts.id)
  if (!target) {
    writeError(`Could not parse an offer ID from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const html = await htmlFetch(target.url)
    if (!html) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const job = parseDetailPage(html, target.id, target.url)
    if (!job) {
      writeError("Offer page carried no readable job data", "PARSE_FAILED")
      return 1
    }

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.salary ? `Salary: ${job.salary}` : "",
        job.contractType ? `Contract: ${job.contractType}` : "",
        job.positionLevel ? `Level: ${job.positionLevel}` : "",
        job.workMode ? `Work mode: ${job.workMode}` : "",
        job.date ? `Posted: ${job.date}` : "",
        job.deadline ? `Closes: ${job.deadline}` : "",
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
