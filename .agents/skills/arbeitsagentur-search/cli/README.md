# arbeitsagentur-cli

CLI for the Bundesagentur für Arbeit public job-search API (Germany). JSON API, no HTML
parsing, zero runtime dependencies.

```bash
bun install                     # dev types only
bun run typecheck
bun test
bun run src/cli.ts search -q "Controlling" -l "Berlin" --jobage 7 --format table
bun run src/cli.ts detail 12288-4871151490-S --format plain
```

API notes: [`../url-reference.md`](../url-reference.md). Flags: [`../SKILL.md`](../SKILL.md).
