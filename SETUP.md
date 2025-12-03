# OneList - Local Development & Deployment Setup

## Environment Variables

This project uses environment variables to keep secrets secure and enable independent forking.

### Required Environment Variables

1. **VITE_INSTANT_APP_ID** (Public - injected into frontend)
   - Your InstantDB application ID
   - Prefixed with `VITE_` so it's accessible in the client

2. **OPENAI_API_KEY** (Server-side only)
   - Your OpenAI API key for AI features
   - Never exposed to the client
   - Used only by the `/api/openai` serverless function

---

## Local Development Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables

Edit `.env.local` and add your keys:
```bash
VITE_INSTANT_APP_ID=your-instantdb-app-id
OPENAI_API_KEY=your-openai-api-key
```

> **Note**: `.env.local` is git-ignored and won't be committed to your repository.

### 3. Run Development Servers

You need **two terminals** running simultaneously:

**Terminal 1 - Vercel Dev (serverless functions):**
```bash
npx vercel dev
```
This runs the `/api/openai` endpoint on `http://localhost:3000`

**Terminal 2 - Vite Dev (frontend):**
```bash
npm run dev
```
This runs the frontend on `http://localhost:5173` with API proxy to port 3000

### 4. Access the App

Open `http://localhost:5173` in your browser. The AI features will work using your local environment variables.

---

## Production Deployment (Vercel)

### 1. Install Vercel CLI (if not already installed)
```bash
npm install -g vercel
```

### 2. Link Your Project
```bash
vercel link
```

### 3. Set Environment Variables in Vercel

#### Option A: Via Vercel Dashboard
1. Go to your project settings
2. Navigate to **Environment Variables**
3. Add the following:
   - `VITE_INSTANT_APP_ID` = your InstantDB app ID (Production, Preview, Development)
   - `OPENAI_API_KEY` = your OpenAI API key (Production, Preview, Development)

#### Option B: Via Vercel CLI
```bash
vercel env add VITE_INSTANT_APP_ID
vercel env add OPENAI_API_KEY
```

### 4. Deploy
```bash
vercel --prod
```

Or push to your connected Git repository for automatic deployment.

---

## Fork Setup (For Open Source Contributors)

When someone forks this repository, they need to:

1. **Clone the fork**
   ```bash
   git clone https://github.com/your-username/onelist.git
   cd onelist
   npm install
   ```

2. **Create their own InstantDB app**
   - Visit [InstantDB](https://instantdb.com)
   - Create a new app
   - Copy the app ID

3. **Get an OpenAI API key**
   - Visit [OpenAI Platform](https://platform.openai.com/api-keys)
   - Create an API key

4. **Set up local environment**
   - Copy `.env.example` to `.env.local`
   - Fill in their own values

5. **Deploy to their own Vercel**
   - Create a Vercel project
   - Set environment variables in Vercel dashboard
   - Deploy

Each fork operates independently with isolated data and API usage.

---

## Architecture

### How Secrets are Protected

- **InstantDB App ID**: Injected at build time via Vite into `window.INSTANT_APP_ID`
- **OpenAI API Key**: Never sent to client; only used in `/api/openai` serverless function

### API Flow
```
Frontend (/public/main.js)
    ↓ POST /api/openai
    ↓ { model, messages, temperature, max_tokens }
Serverless Function (/api/openai.js)
    ↓ Reads process.env.OPENAI_API_KEY
    ↓ Calls OpenAI API
    ↓ Returns { answer }
Frontend
    ↓ Displays result
```

### Development Proxy
Vite proxies `/api/*` requests to `http://localhost:3000` where `vercel dev` runs the serverless functions.

---

## Troubleshooting

### "Missing OPENAI_API_KEY" error
- Check that `.env.local` exists and has `OPENAI_API_KEY=your-key`
- Restart `vercel dev` after adding the variable

### "window.INSTANT_APP_ID is undefined"
- Ensure `.env.local` has `VITE_INSTANT_APP_ID=your-id`
- Restart `npm run dev` after adding the variable

### AI features don't work locally
- Ensure both `vercel dev` and `npm run dev` are running
- Check browser console for errors
- Verify the API proxy in `vite.config.js` points to port 3000

### Production deployment fails
- Verify environment variables are set in Vercel dashboard
- Check build logs for missing dependencies
- Ensure `vercel.json` is properly configured

---

## Commands Reference

```bash
# Development
npm run dev              # Start Vite dev server (port 5173)
npx vercel dev          # Start Vercel serverless dev (port 3000)

# Build
npm run build           # Build for production

# Preview
npm run preview         # Preview production build locally

# Deploy
vercel                  # Deploy to preview
vercel --prod          # Deploy to production
```
