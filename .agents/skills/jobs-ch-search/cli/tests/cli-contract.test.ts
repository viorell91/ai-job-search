import { describe, expect, test } from "bun:test"
import { runCLI } from "./helpers"

// Network-free: every case below is rejected by argument handling before any
// fetch is attempted, so this suite passes offline and cannot flake on jobs.ch.

function expectJsonError(result: { exitCode: number; stdout: string; stderr: string }, code: string) {
  expect(result.exitCode).toBe(1)
  expect(result.stdout).toBe("")
  expect(JSON.parse(result.stderr).code).toBe(code)
}

describe("jobs-ch CLI contract", () => {
  test("no arguments prints help and exits 1", async () => {
    const result = await runCLI([])
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("jobs-ch-cli")
    expect(result.stdout).toContain("USAGE")
  })

  test("--help prints help and exits 0 when a command is given", async () => {
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

  test("detail with a non-UUID id is rejected before any request", async () => {
    expectJsonError(await runCLI(["detail", "12345"]), "BAD_ID")
  })

  test("a non-numeric --jobage is rejected", async () => {
    expectJsonError(await runCLI(["search", "-q", "test", "--jobage", "soon"]), "BAD_ARG")
  })

  test("a non-numeric --limit is rejected", async () => {
    expectJsonError(await runCLI(["search", "-q", "test", "--limit", "many"]), "BAD_ARG")
  })

  test("errors never go to stdout", async () => {
    const result = await runCLI(["detail", "not-a-uuid"])
    expect(result.stdout).toBe("")
    expect(result.stderr).not.toBe("")
  })
})
