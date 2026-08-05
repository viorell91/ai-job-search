# jobs-ch-cli

Zero-dependency CLI for searching [jobs.ch](https://www.jobs.ch), the largest general
job board in Switzerland. Runs on `bun` with nothing installed beyond the repo clone.

## Install

```bash
cd .agents/skills/jobs-ch-search/cli && bun install && cd ../../../..
```

`bun install` pulls dev types only (`typescript`, `@types/bun`). There are no runtime
dependencies — the CLI uses `fetch` and regex parsing.

## Usage

```bash
bun run src/cli.ts search -q "machine learning engineer" -l "Zürich" --format table
bun run src/cli.ts search -q "NLP" -l "Basel" --jobage 14
bun run src/cli.ts detail 5cd10373-7316-426d-bc44-8b84a0b59a1d --format plain
```

Run without arguments for the full flag reference.

## Design notes

- **Reads pages, not the API.** jobs.ch's `robots.txt` disallows `/api/` and
  `/api_proxy/`. This CLI parses the public search and detail pages instead. Do not
  switch it to the JSON API.
- **schema.org first.** Both page types embed `JobPosting` JSON-LD, which is stable.
  CSS classes on jobs.ch are Panda-CSS utilities and churn on every deploy, so they are
  used only as a last-resort fallback for the city and workload.
- **React comment separators.** Rendered labels are `Arbeitsort<!-- -->:`. `helpers.ts`
  strips HTML comments before matching. This bit once: unit tests on hand-written
  fixtures passed while every live result returned `location: null`. The fixture in
  `tests/parsing.test.ts` now includes the separators — keep them.
- Errors go to stderr as `{ "error", "code" }` with exit code 1; stdout stays clean.

## Development

```bash
bun run typecheck   # tsc --noEmit
bun run test        # bun test --timeout 30000
```

The suite is network-free — `tests/cli-contract.test.ts` exercises argument handling
before any request, and the parser tests run against fixtures. See
`../url-reference.md` for the endpoint and field-path documentation to update when the
portal changes.
