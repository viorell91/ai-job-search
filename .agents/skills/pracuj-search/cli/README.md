# pracuj-cli

CLI for [pracuj.pl](https://www.pracuj.pl), Poland's dominant job board. Reads the site's
embedded `__NEXT_DATA__` JSON rather than scraping markup.

```bash
bun install                     # dev types only
bun run typecheck
bun test
bun run src/cli.ts search -q "controlling" -l "Warszawa" --jobage 7 --format table
bun run src/cli.ts detail 1005003253 --format plain
```

**Requires `curl` on PATH** — pracuj.pl rejects Bun's TLS fingerprint with a 403, so
requests are made through curl. See [`../url-reference.md`](../url-reference.md).

Personal use only — keep request volume low.
