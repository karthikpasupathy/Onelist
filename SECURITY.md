# Security Policy

## Reporting Security Issues

If you discover a security vulnerability, please email the maintainer directly rather than opening a public issue.

## Secrets Management

**OneList does NOT store any API keys or secrets in the codebase.**

All sensitive credentials are managed via environment variables:

### Required Environment Variables

1. **`VITE_INSTANT_APP_ID`** (InstantDB App ID)
   - Used for database authentication
   - Get yours at: https://instantdb.com
   - Set in: Vercel Project Settings → Environment Variables

2. **`OPENAI_API_KEY`** (OpenAI API Key)
   - Used for AI features (server-side only)
   - Get yours at: https://platform.openai.com
   - Set in: Vercel Project Settings → Environment Variables

### For Contributors

- Never commit `.env` or `.env.local` files (already in `.gitignore`)
- Use `.env.example` as a template
- All secrets must be configured via Vercel environment variables
- API keys are never exposed to the client

### For Self-Hosting

When you fork this project:

1. Create your own InstantDB app at https://instantdb.com
2. Get your own OpenAI API key at https://platform.openai.com
3. Configure both in your Vercel project settings
4. The app will not work without these environment variables

## Dependencies

This project uses:
- **Vite** - Build tool
- **InstantDB** - Realtime database with built-in auth
- **OpenAI API** - AI-powered features (via serverless function proxy)
- **Lucide Icons** - Icon library (CDN)

All dependencies are loaded from public CDNs or npm packages.
