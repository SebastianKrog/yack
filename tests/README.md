# Tests

Run the full suite from the project root:

```sh
npm test
```

Node's test runner discovers every `*.test.cjs` file, including nested feature
folders. No integration checks are excluded from the default command.

| Folder | Coverage |
| --- | --- |
| `checklist/` | Tasks, ELLER choices, dependencies, editor, schedules, lists, reminders, JSON and navigation |
| `notes/` | Writing, note lifecycle, layout, dragging, mobile interactions, media and real PDF.js rendering |
| `feedback/` | Achievements, statistics, trophies, confetti and sound |
| `rendering/` | Formatting, ink, scribbles, emphasis, deferral controls and CSS regressions |
| `sync/` | Client sync, server sync and MCP contracts |
| `helpers/` | Isolated DOM/VM fixtures, in-memory SQLite and the PDF integration harness |

Run a feature or individual scenario:

```sh
node --test tests/sync/*.test.cjs
node --test tests/notes/pdf-upload.test.cjs
npm test -- --test-name-pattern="overdue"
```

The full suite normally takes a few seconds; timing depends on the machine.
Tests use fake clocks and explicit timer advancement instead of waiting for
animations, daily resets, polling or network timeouts. The PDF check starts a
bounded subprocess because PDF.js's synthetic-module harness needs Node's
experimental VM module flag; it exercises the installed library rather than a
mock. Keep it in the full suite.

The DOM helper caches HTML and compiled scripts, but creates a fresh document,
VM context, storage and timer queue for each fixture. Database migrations are
read once per worker; each database remains independent and closes after its
test. SQL statements are reused only within their owning database.

Test current-format data throughout, including database and backup fixtures.
Older formats are covered only by explicit rejection tests. Remove a scenario
when its behaviour has been retired or another test covers all its assertions. Large-payload tests should exercise the large
payload once; unrelated retention loops should use small documents.

These lightweight DOM tests do not render CSS or replace browser verification.
Server tests never connect to production services or access user profiles.
