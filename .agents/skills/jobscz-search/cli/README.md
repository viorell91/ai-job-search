# jobscz-cli

CLI for searching [Jobs.cz](https://www.jobs.cz), the dominant general job board in the
Czech Republic. Zero runtime dependencies — runs with `bun` alone.

```bash
bun install                     # dev types only
bun run typecheck
bun test
bun run src/cli.ts search -q "controlling" -l "Praha" --jobage 7 --format table
bun run src/cli.ts detail 2001322882 --format plain
```

Endpoint and parsing notes: [`../url-reference.md`](../url-reference.md).
Flags and output shape: [`../SKILL.md`](../SKILL.md).

Personal use only — keep request volume low.
