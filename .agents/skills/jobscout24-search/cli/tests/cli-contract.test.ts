import { describe, expect, test } from "bun:test"
import { runCLI } from "./helpers"
import { buildUrl } from "../src/commands/search"

// Network-free: argument handling and URL building only.

function expectJsonError(result: { exitCode: number; stdout: string; stderr: string }, code: string) {
  expect(result.exitCode).toBe(1)
  expect(result.stdout).toBe("")
  expect(JSON.parse(result.stderr).code).toBe(code)
}

describe("jobscout24 CLI contract", () => {
  test("no arguments prints help and exits 1", async () => {
    const result = await runCLI([])
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("jobscout24-cli")
  })

  test("--help exits 0 when a command is given", async () => {
    const result = await runCLI(["search", "--help"])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("SEARCH FLAGS")
  })

  test("an unknown command errors as JSON on stderr", async () => {
    expectJsonError(await runCLI(["frobnicate"]), "BAD_CMD")
  })

  test("detail without an id errors as JSON on stderr", async () => {
    expectJsonError(await runCLI(["detail"]), "NO_ID")
  })

  test("detail with an unparseable id is rejected before any request", async () => {
    expectJsonError(await runCLI(["detail", "abc"]), "BAD_ID")
  })

  test("a non-numeric --limit is rejected", async () => {
    expectJsonError(await runCLI(["search", "-q", "x", "--limit", "many"]), "BAD_ARG")
  })
})

describe("buildUrl", () => {
  test("uses `p` for pagination, because `page` is silently ignored by the portal", () => {
    const url = buildUrl({ query: "engineer", jobage: 9999, page: 3, format: "json" })
    expect(url).toContain("p=3")
    expect(url).not.toContain("page=3")
  })

  test("routes keyword and location through the path, never through ?q=", () => {
    const url = buildUrl({ query: "engineer", location: "Basel", jobage: 9999, page: 1, format: "json" })
    expect(url).toBe("https://www.jobscout24.ch/de/jobs/engineer-in-basel/")
    expect(url).not.toContain("q=")
  })

  test("omits pagination on page 1", () => {
    const url = buildUrl({ query: "x", jobage: 9999, page: 1, format: "json" })
    expect(url).not.toContain("p=")
  })
})
