# karriere-at-cli

CLI for [karriere.at](https://www.karriere.at), Austria's dominant job board. Zero runtime
dependencies — runs with `bun` alone.

```bash
bun install                     # dev types only
bun run typecheck
bun test
bun run src/cli.ts search -q "Controlling" -l "Wien" --format table
bun run src/cli.ts detail 7710443 --format plain
```

Endpoint and parsing notes: [`../url-reference.md`](../url-reference.md).
Flags and output shape: [`../SKILL.md`](../SKILL.md).

Personal use only — keep request volume low.
