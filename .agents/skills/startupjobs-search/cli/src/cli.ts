#!/usr/bin/env bun
// Self-contained CLI for searching jobs on startupjobs.cz (Czech Republic).
// Uses the site's public offers API. No CLI framework, zero runtime deps.
//
// startupjobs.cz robots.txt is fully permissive ("Allow: /", empty Disallow)
// and does not restrict /api/. Personal-use volumes only.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"

const DEFAULT_SCAN_PAGES = 8
const MAX_SCAN_PAGES = 30

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "location", n: "limit" }
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

const HELP = `startupjobs-cli — search jobs on startupjobs.cz (Czech Republic)

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Keywords, matched CLIENT-SIDE against title, company,
                          area tags and the full description. All terms must
                          match; case- and diacritic-insensitive.
  --location, -l <text>   City, e.g. "Praha", "Brno". Remote offers always match.
  --remote                Only offers flagged as remote.
  --scan-pages <n>        How many API pages (20 offers each) to scan.
                          Default ${DEFAULT_SCAN_PAGES}, max ${MAX_SCAN_PAGES}. The whole board is ~21 pages;
                          scanning stops early at the last page.
  --limit, -n <n>         Cap results emitted.
  --format <fmt>          json (default) | table | plain.

NOTE
  This API exposes NO keyword filter and NO publication date, so --query is
  applied locally and every result has "date": null. --jobage is not supported.

EXAMPLES
  bun run src/cli.ts search -q "finance" -l "Praha" --format table
  bun run src/cli.ts search -q "controlling" --scan-pages 21 --format table
  bun run src/cli.ts search --remote --format table
  bun run src/cli.ts detail 106485 --format plain
`

function parseIntFlag(name: string, raw: unknown): number | null {
  const val = parseInt(raw as string, 10)
  if (isNaN(val)) {
    process.stderr.write(
      JSON.stringify({ error: `--${name} must be a number, got "${raw}"`, code: "BAD_ARG" }) + "\n",
    )
    return null
  }
  return val
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  let scanPages = DEFAULT_SCAN_PAGES
  if (flags["scan-pages"] !== undefined) {
    const v = parseIntFlag("scan-pages", flags["scan-pages"])
    if (v === null) return 1
    scanPages = Math.min(MAX_SCAN_PAGES, Math.max(1, v))
  }

  if (cmd === "search") {
    const fmt = (flags.format as string) || "json"
    if (flags.limit !== undefined) {
      const v = parseIntFlag("limit", flags.limit)
      if (v === null) return 1
      flags.limit = String(v)
    }

    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query : undefined,
      location: typeof flags.location === "string" ? flags.location : undefined,
      remoteOnly: flags.remote === true,
      scanPages,
      limit: flags.limit ? parseInt(flags.limit as string, 10) : undefined,
      format: (["json", "table", "plain"].includes(fmt) ? fmt : "json") as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) {
      process.stderr.write(JSON.stringify({ error: "detail requires an <id|url>", code: "NO_ID" }) + "\n")
      return 1
    }
    const fmt = (flags.format as string) || "json"
    const opts: DetailOpts = {
      id,
      // detail must be able to reach the whole board to find an offer by id.
      scanPages: flags["scan-pages"] !== undefined ? scanPages : MAX_SCAN_PAGES,
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
      JSON.stringify({ error: e instanceof Error ? e.message : String(e), code: "INTERNAL_ERROR" }) + "\n",
    )
    process.exit(1)
  })
