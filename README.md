# Yack

Yet another checklist, kinda. Yack is a personal checklist for recurring routines, one-off tasks, and handwritten-style notes. It supports scheduled lists, task dependencies, reminders, image and PDF notes, and English and Danish.

Yack works locally in the browser. When hosted on ChatGPT Sites with sign-in configured, it can also sync across devices and expose authenticated task and reminder tools.

## Run locally

Use Node.js 22.13 or later and pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
npm run dev -- --host 127.0.0.1
```

Open the URL printed by the server. Checklist progress and notes are stored in your browser. Choose a language in **Profile → Language**. **Automatic** follows your browser preferences and falls back to English.

To try account sync locally, apply the two checked-in SQL files in order to the local database. Stop the dev server first. Run this from the repository root:

```sh
npm run build
pnpm exec wrangler d1 execute DB --local --persist-to .wrangler/state --config dist/server/wrangler.json --file drizzle/0000_ancient_union_jack.sql
pnpm exec wrangler d1 execute DB --local --persist-to .wrangler/state --config dist/server/wrangler.json --file drizzle/0001_loving_kid_colt.sql
npm run dev -- --host 127.0.0.1
```

The dev server provides a loopback-only test account through the Profile sign-in link. `npm start` previews the production build on loopback with the same local D1 and R2 state.

## Tests

```sh
npm test
npm run build
```

The suite includes the real PDF.js renderer and isolated SQLite tests for sync, backups, and MCP. See [tests/README.md](tests/README.md) for focused commands.

## Hosting and data

The [Sites manifest](.openai/hosting.json) declares the D1 `DB` binding for sync, the private R2 `BUCKET` binding for media, and the MCP capability. Register your own Site and set its project ID in that manifest before publishing. Apply both schema migrations to a fresh D1 database.

ChatGPT Sites owns sign-in and supplies the authenticated identity to the Worker. Set the runtime variable `YACK_TRUST_SITES_AUTH=true` only when the Worker is accessible exclusively through trusted Sites ingress that strips caller-supplied identity headers. The default production build ignores those headers and runs without account sync. Keep runtime credentials and deployment configuration out of Git.

Task import and export use the `starting-work-tasks` version 2 format with explicit lists. Time-based tasks use Europe/Copenhagen. JSON exports include media references. The original files live in browser storage and, for synced accounts, private R2 storage.

The authenticated `/mcp` endpoint supports recurring task and reminder edits. Use `get_task_list` to read the document and its revision, then submit the complete updated document with `save_task_list`, that revision, and a unique request ID. Preserve existing IDs. Concurrent edits trigger a revision conflict and repeated requests with the same request ID are idempotent.

## License

Yack is released under the [MIT License](LICENSE).

Font and sound credits are in [public/fonts](public/fonts) and [public/sounds/CREDITS.txt](public/sounds/CREDITS.txt). The vendored Sites Vite plugin retains its [upstream license](build/sites-vite-plugin.LICENSE).
