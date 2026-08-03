import { describe, expect, test } from "bun:test"
import { runCLI } from "./helpers.js"

describe("CLI contract", () => {
  test("no command prints help and exits 1", async () => {
    const r = await runCLI([])
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toContain("pracuj-cli")
  })

  test("--help exits 0", async () => {
    const r = await runCLI(["search", "--help"])
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain("SEARCH FLAGS")
  })

  test("unknown command errors on stderr as JSON", async () => {
    const r = await runCLI(["frobnicate"])
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toBe("")
    expect(JSON.parse(r.stderr)).toMatchObject({ code: "BAD_CMD" })
  })

  test("non-numeric --page is rejected before any request", async () => {
    const r = await runCLI(["search", "-q", "x", "--page", "abc"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr)).toMatchObject({ code: "BAD_ARG" })
  })

  test("non-numeric --jobage is rejected", async () => {
    const r = await runCLI(["search", "-q", "x", "--jobage", "week"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr)).toMatchObject({ code: "BAD_ARG" })
  })

  test("detail without an id errors", async () => {
    const r = await runCLI(["detail"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr)).toMatchObject({ code: "NO_ID" })
  })

  test("detail with an unparseable id errors without fetching", async () => {
    const r = await runCLI(["detail", "https://example.com/x"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr)).toMatchObject({ code: "BAD_ID" })
  })
})
