#!/usr/bin/env bun
// Self-contained CLI for the Bundesagentur für Arbeit job search API (Germany).
// Structured JSON in, structured JSON out — no HTML parsing, no CLI framework,
// zero runtime dependencies.
//
// arbeitsagentur.de's robots.txt is fully permissive ("Disallow:" / "Allow: /"),
// and this is the public API behind the portal's own front end.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "location", n: "limit", r: "radius" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--") || a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const HELP = `arbeitsagentur-cli — search jobs on the Bundesagentur für Arbeit job board (Germany)

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <refnr|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Keywords (job title, skill, role). German works best.
  --location, -l <text>   City, postcode or region, e.g. "Berlin", "München", "60311".
  --radius, -r <km>       Search radius around --location, in km.
  --jobage <days>         Posted within N days. The portal honours four buckets
                          only: 1, 7, 14, 28. Values in between round up to the
                          next bucket; above 28 the filter is dropped.
  --worktime <mode>       fulltime | parttime | shift.
  --page <n>              1-indexed page. Default 1.
  --size <n>              Results per page (default 25, max 100).
  --limit, -n <n>         Cap results emitted (client-side).
  --format <fmt>          json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "Controlling" -l "Berlin" --jobage 7 --format table
  bun run src/cli.ts search -q "Consultant" -l "München" -r 25 --worktime fulltime
  bun run src/cli.ts search -q "Financial Analyst" -l "Frankfurt am Main" --page 2
  bun run src/cli.ts detail 12288-4871151490-S --format plain

Data: Bundesagentur für Arbeit public job-search API. No account or personal key needed.
`

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  if (cmd === "search") {
    const fmt = (flags.format as string) || "json"

    const parseIntFlag = (name: string, raw: string | boolean | string[]): number | null => {
      const val = parseInt(raw as string, 10)
      if (isNaN(val)) {
        process.stderr.write(
          JSON.stringify({ error: `--${name} must be a number, got "${raw}"`, code: "BAD_ARG" }) + "\n",
        )
        return null
      }
      return val
    }

    for (const name of ["jobage", "page", "limit", "size", "radius"]) {
      if (flags[name] !== undefined) {
        const v = parseIntFlag(name, flags[name])
        if (v === null) return 1
        flags[name] = String(v)
      }
    }

    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query : undefined,
      location: typeof flags.location === "string" ? flags.location : undefined,
      radius: flags.radius ? parseInt(flags.radius as string, 10) : undefined,
      jobage: flags.jobage ? parseInt(flags.jobage as string, 10) : 9999,
      worktime: typeof flags.worktime === "string" ? flags.worktime : undefined,
      page: flags.page ? Math.max(1, parseInt(flags.page as string, 10)) : 1,
      size: flags.size ? Math.min(100, Math.max(1, parseInt(flags.size as string, 10))) : 25,
      limit: flags.limit ? parseInt(flags.limit as string, 10) : undefined,
      format: (["json", "table", "plain"].includes(fmt) ? fmt : "json") as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) {
      process.stderr.write(JSON.stringify({ error: "detail requires a <refnr|url>", code: "NO_ID" }) + "\n")
      return 1
    }
    const fmt = (flags.format as string) || "json"
    const opts: DetailOpts = {
      id,
      format: (fmt === "plain" ? "plain" : "json") as DetailOpts["format"],
    }
    return runDetail(opts)
  }

  process.stderr.write(JSON.stringify({ error: `Unknown command "${cmd}"`, code: "BAD_CMD" }) + "\n")
  return 1
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(
      JSON.stringify({
        error: e instanceof Error ? e.message : String(e),
        code: "INTERNAL_ERROR",
      }) + "\n",
    )
    process.exit(1)
  })
