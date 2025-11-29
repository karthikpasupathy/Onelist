# OneList

A simple, classy productivity text editor inspired by Jeff Huang's "never-ending .txt file" method.

## Features

- **Single file workflow**: All your todos, notes, and ideas in one place
- **Date commands**: Type `/today` or `/tomorrow` to insert dates (dd-MM-yyyy)
- **Quick append**: Ctrl+Shift+D to append today's date header at the end
- **Fast search**: Find any line or #tag instantly
- **Snapshots**: Automatic backups you can restore anytime
- **Cross-platform**: Works on desktop and mobile as a PWA
- **Offline-ready**: Uses InstantDB for sync and offline support

## Development

```bash
npm install
npm run dev
```

## Deploy to Vercel

1. Push this repo to GitHub
2. Import it to Vercel
3. Deploy!

## Usage

- Type `/today` or `/tomorrow` to insert the current/next date
- Click "+ Date" or press Ctrl+Shift+D to append today's date at the end
- Use the search box to find text or filter by #tags
- Click "Snapshots" to view, restore, or download previous versions
- Click "Export" to download your current file

## InstantDB Schema

The app uses two entities:

- `documents`: { userId, content, createdAt, updatedAt }
- `snapshots`: { userId, content, createdAt }
