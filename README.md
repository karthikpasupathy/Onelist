# OneList

A simple, classy productivity text editor inspired by Jeff Huang's "never-ending .txt file" method.

## Features

- **Single file workflow**: All your todos, notes, and ideas in one place
- **Date commands**: Type `/today` or `/tomorrow` to insert dates (dd-MM-yyyy)
- **Quick append**: Ctrl+Shift+D to append today's date header at the end
- **Fast search**: Find any line or #tag instantly
- **Snapshots**: Automatic backups you can restore anytime
- **Cross-platform**: Works on desktop and mobile as a PWA
- **Offline-ready**: Uses InstantDB realtime sync plus an IndexedDB draft outbox for safer reconnects

## Development

```bash
npm install
npm run dev
npm test
```

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fkarthikpasupathy%2FOnelist&env=VITE_INSTANT_APP_ID&envDescription=Required%20InstantDB%20App%20ID%20for%20OneList&envLink=https%3A%2F%2Fgithub.com%2Fkarthikpasupathy%2FOnelist%23setup)

### Setup Instructions

1. Click the "Deploy with Vercel" button above
2. Create a new InstantDB app at [instantdb.com](https://instantdb.com)
3. Add this environment variable in Vercel:
   - `VITE_INSTANT_APP_ID` - Your InstantDB App ID
4. Deploy!

### Manual Deployment

Alternatively, you can:
1. Fork this repository
2. Import it to Vercel from your GitHub account
3. Configure the environment variables as described above

## Usage

- Type `/today` or `/tomorrow` to insert the current/next date
- Click "+ Date" or press Ctrl+Shift+D to append today's date at the end
- Use the search box to find text or filter by #tags
- Click "Snapshots" to view, restore, or download previous versions
- Click "Export" to download your current file

## Sync Model

OneList is optimized for one user syncing a personal text file across devices.
The browser keeps the current draft, its merge base and its dirty state in
IndexedDB, so offline edits can be reconciled after reconnect.

Every document has a revision counter (`rev`). A save names the revision it was
based on and only succeeds if the server is still at that revision
(compare-and-swap). If another device saved first, the app pulls that copy,
three-way merges it with the local text, and retries. Decisions never depend on
comparing clocks between devices.

When two devices edit different line regions, OneList merges them silently.
When both devices edit the same unstable region, the app keeps both versions in
a visible `ONELIST MERGE CONFLICT` block instead of silently choosing a winner.

## Code Layout

- `src/main.js` - session lifecycle and editor event wiring
- `src/documentSync.js` - save, merge and draft logic for the open document
- `src/syncGuard.js`, `src/textMerge.js` - pure sync decisions and the merge
- `src/store/` - the storage backend. `instantStore.js` is the only file that
  imports InstantDB; `localStore.js` is the browser-only dev backend. A new
  backend implements the same interface and is selected in `store/index.js`.
- `src/snapshots.js`, `src/snippets.js`, `src/search.js`, `src/yearSwitcher.js`,
  `src/editorCommands.js`, `src/textFormatting.js`, `src/appUpdate.js`,
  `src/authUi.js`, `src/modals.js` - one feature each

## InstantDB Schema

Schema and permissions live in `instant.schema.ts` and `instant.perms.ts`.

- `documents`: `{ userId, docKey, year, content, createdAt, updatedAt, rev, prevRev }`
- `snapshots`: `{ userId, year, content, createdAt, pinned }`
- `snippets`: `{ userId, name, content, createdAt, updatedAt }`
- `settings`: `{ userId, ... }`

Documents use a deterministic `docKey`/UUID per user-year to avoid duplicate
year documents across tabs and devices. Permissions are owner-only by `userId`.
