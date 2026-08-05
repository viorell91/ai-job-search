import { afterEach, describe, expect, test } from "bun:test"
import { runSearch, buildUrl } from "../src/commands/search"

const originalFetch = globalThis.fetch
const originalStdoutWrite = process.stdout.write

afterEach(() => {
  globalThis.fetch = originalFetch
  process.stdout.write = originalStdoutWrite
})

function captureStdout(): () => string {
  let stdout = ""
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += chunk.toString()
    return true
  }) as typeof process.stdout.write
  return () => stdout
}

const FIXTURE = `<html><script type="application/ld+json">${JSON.stringify([
  {
    "@type": "ItemList",
    itemListElement: [
      {
        "@type": "ListItem",
        item: {
          "@type": "JobPosting",
          title: "ML Engineer",
          identifier: { value: "5cd10373-7316-426d-bc44-8b84a0b59a1d" },
          hiringOrganization: { name: "Acme AG" },
          jobLocation: { address: { addressLocality: "Basel" } },
          datePosted: "2026-07-20T13:32:10+02:00",
          url: "https://www.jobs.ch/de/stellenangebote/detail/5cd10373-7316-426d-bc44-8b84a0b59a1d/",
        },
      },
    ],
  },
])}</script></html>`

describe("buildUrl", () => {
  test("maps flags onto the portal's query parameters", () => {
    const url = new URL(
      buildUrl({ query: "ml engineer", location: "Basel", jobage: 7, page: 2, format: "json" }),
    )
    expect(url.origin + url.pathname).toBe("https://www.jobs.ch/de/stellenangebote/")
    expect(url.searchParams.get("term")).toBe("ml engineer")
    expect(url.searchParams.get("location")).toBe("Basel")
    expect(url.searchParams.get("publication-date")).toBe("7")
    expect(url.searchParams.get("page")).toBe("2")
  })

  test("omits page=1 and the open-ended jobage sentinel", () => {
    const url = new URL(buildUrl({ query: "x", jobage: 9999, page: 1, format: "json" }))
    expect(url.searchParams.has("page")).toBe(false)
    expect(url.searchParams.has("publication-date")).toBe(false)
  })

  test("never sends the /api/ path that robots.txt disallows", () => {
    const url = buildUrl({ query: "x", jobage: 9999, page: 1, format: "json" })
    expect(url).not.toContain("/api")
  })
})

describe("runSearch", () => {
  test("emits the { meta, results } envelope the portal contract requires", async () => {
    globalThis.fetch = (async () => new Response(FIXTURE)) as typeof fetch
    const stdout = captureStdout()

    const code = await runSearch({ query: "ml", jobage: 9999, page: 1, format: "json" })

    expect(code).toBe(0)
    const payload = JSON.parse(stdout())
    expect(payload.meta).toEqual({ count: 1, page: 1 })
    expect(payload.results[0]).toMatchObject({ title: "ML Engineer", company: "Acme AG", location: "Basel" })
  })

  test("--limit 0 emits zero results", async () => {
    globalThis.fetch = (async () => new Response(FIXTURE)) as typeof fetch
    const stdout = captureStdout()

    const code = await runSearch({ query: "ml", jobage: 9999, page: 1, limit: 0, format: "json" })

    expect(code).toBe(0)
    expect(JSON.parse(stdout()).results).toHaveLength(0)
  })

  test("a transport failure exits 1 and writes JSON to stderr, not stdout", async () => {
    globalThis.fetch = (async () => {
      throw new Error("network down")
    }) as typeof fetch
    const stdout = captureStdout()
    let stderr = ""
    const originalStderrWrite = process.stderr.write
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr += chunk.toString()
      return true
    }) as typeof process.stderr.write

    const code = await runSearch({ query: "ml", jobage: 9999, page: 1, format: "json" })
    process.stderr.write = originalStderrWrite

    expect(code).toBe(1)
    expect(stdout()).toBe("")
    expect(JSON.parse(stderr).code).toBe("SEARCH_FAILED")
  })
})
