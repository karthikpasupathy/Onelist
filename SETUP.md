# OneList - Local Development & Deployment Setup

## Environment Variables

This project uses environment variables to keep secrets secure and enable independent forking.

### Required Environment Variables

1. **VITE_INSTANT_APP_ID** (Public - injected into frontend)
   - Your InstantDB application ID
   - Prefixed with `VITE_` so it's accessible in the client

---

## Local Development Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables

Edit `.env.local` and add your app ID:
```bash
VITE_INSTANT_APP_ID=your-instantdb-app-id
```

> **Note**: `.env.local` is git-ignored and won't be committed to your repository.

### 3. Run the Development Server
```bash
npm run dev
```
This runs the frontend on `http://localhost:5173`

### 4. Access the App

Open `http://localhost:5173` in your browser.

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

#### Option B: Via Vercel CLI
```bash
vercel env add VITE_INSTANT_APP_ID
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

3. **Set up local environment**
   - Copy `.env.example` to `.env.local`
   - Fill in their own values

4. **Deploy to their own Vercel**
   - Create a Vercel project
   - Set environment variables in Vercel dashboard
   - Deploy

Each fork operates independently with isolated data.

---

## Architecture

### How Secrets are Protected

- **InstantDB App ID**: Injected at build time via Vite into the frontend bundle

---

## Troubleshooting

### "window.INSTANT_APP_ID is undefined"
- Ensure `.env.local` has `VITE_INSTANT_APP_ID=your-id`
- Restart `npm run dev` after adding the variable

### Production deployment fails
- Verify environment variables are set in Vercel dashboard
- Check build logs for missing dependencies
- Ensure `vercel.json` is properly configured

---

## Commands Reference

```bash
# Development
npm run dev              # Start Vite dev server (port 5173)

# Build
npm run build           # Build for production
npm test                # Build and run regression checks

# Preview
npm run preview         # Preview production build locally

# Deploy
vercel                  # Deploy to preview
vercel --prod          # Deploy to production
```
