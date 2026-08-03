# startupjobs-cli

CLI for [startupjobs.cz](https://www.startupjobs.cz), the Czech startup/tech job board.
Uses the site's public offers API; zero runtime dependencies.

```bash
bun install                     # dev types only
bun run typecheck
bun test
bun run src/cli.ts search -q "finance" -l "Praha" --format table
bun run src/cli.ts detail 106485 --format plain
```

The API has no keyword filter and no publication date — `--query` is applied client-side
and every result has `date: null`. See [`../url-reference.md`](../url-reference.md).
