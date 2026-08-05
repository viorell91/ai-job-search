# jobscout24-cli

Zero-dependency CLI for searching [jobscout24.ch](https://www.jobscout24.ch), a large
general job board in Switzerland. Runs on `bun` with nothing installed beyond the repo
clone.

## Install

```bash
cd .agents/skills/jobscout24-search/cli && bun install && cd ../../../..
```

`bun install` pulls dev types only. There are no runtime dependencies.

## Usage

```bash
bun run src/cli.ts search -q "machine learning" -l "Basel" --format table
bun run src/cli.ts search -q "software engineer" -l "Zürich"
bun run src/cli.ts detail 10287453 --format plain
```

Run without arguments for the full flag reference.

## Design notes

- **Search is path-based.** `?q=` returns 200 and is then ignored — it produced nursing
  vacancies for `machine learning`. Keyword and city compose into the path instead:
  `/de/jobs/<keyword>-in-<city>/`. Do not rewrite this as a query parameter.
- **Pagination is `p`.** `page` is silently ignored.
- **The listing has no schema.org data**, so search parses semantic HTML
  (`li.job-list-item`). The **detail page does** carry a `JobPosting`, including
  `baseSalary`, so `detail` reads that instead of the markup.
- **Titles come from the `title=` attribute**, not the element text, which is truncated.
- **De-duplicate by job id.** Paid slots render twice per page.
- Errors go to stderr as `{ "error", "code" }` with exit code 1; stdout stays clean.

## Development

```bash
bun run typecheck   # tsc --noEmit
bun run test        # bun test --timeout 30000
```

The suite is network-free. See `../url-reference.md` for the routing and field-anchor
documentation to update when the portal changes.
