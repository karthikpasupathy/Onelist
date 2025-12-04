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

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fkarthikpasupathy%2FOnelist&env=VITE_INSTANT_APP_ID,OPENAI_API_KEY&envDescription=Required%20API%20keys%20for%20OneList&envLink=https%3A%2F%2Fgithub.com%2Fkarthikpasupathy%2FOnelist%23setup)

### Setup Instructions

1. Click the "Deploy with Vercel" button above
2. Create a new InstantDB app at [instantdb.com](https://instantdb.com)
3. Get your OpenAI API key from [platform.openai.com](https://platform.openai.com/api-keys)
4. Add these environment variables in Vercel:
   - `VITE_INSTANT_APP_ID` - Your InstantDB App ID
   - `OPENAI_API_KEY` - Your OpenAI API Key
5. Deploy!

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

## InstantDB Schema

The app uses two entities:

- `documents`: { userId, content, createdAt, updatedAt }
- `snapshots`: { userId, content, createdAt }
