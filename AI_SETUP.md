# AI Chat Feature Setup Guide

## Overview

OneList now includes an AI chat feature that analyzes your document content using OpenAI. The chat is:
- **Non-intrusive**: Opens in a modal, doesn't clutter the editor
- **Temporary**: Conversations are cleared when you close the chat
- **Secure**: Your API key is stored in a separate secrets collection and NEVER sent to the browser

## Security Architecture

**Enhanced Security Model:**
- API keys are stored in a separate `secrets` collection that the frontend never queries
- Settings UI uses a `hasAiKey` boolean flag to show "✓ Key saved" status
- All API key operations go through secure server endpoints (`/api/save-key`, `/api/ask-ai`)
- The browser never receives the raw API key in production
- All AI requests are processed server-side only

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

This will install the required `@instantdb/admin` package for server-side database queries.

### 2. Get Your OpenAI API Key

1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Sign in or create an account
3. Click "Create new secret key"
4. Copy the key (you won't be able to see it again!)

### 3. Get Your InstantDB Admin Token

1. Go to [instantdb.com/dash](https://instantdb.com/dash)
2. Select your OneList app
3. Navigate to Settings or Admin section
4. Copy your Admin Token

### 4. Configure Vercel Environment Variables

If deploying to Vercel:

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add the following variable:
   - **Name**: `INSTANTDB_ADMIN_TOKEN`
   - **Value**: Your InstantDB admin token (from step 3)
   - **Environment**: Production, Preview, Development (select all)

### 5. Add Your OpenAI API Key in the App

1. Run the app: `npm run dev`
2. Sign in to OneList
3. Click your profile menu (top-right)
4. Click **Settings**
5. Enter your OpenAI API key
6. (Optional) Customize the system prompt
7. Click **Save Settings**

## Using the AI Chat

1. Click the **Chat** icon in the top bar (speech bubble icon)
2. Type your question about your document
3. Press Enter or click Send
4. The AI will analyze your document and respond

**Example questions:**
- "Summarize my tasks for today"
- "What are the main topics in this document?"
- "Find all items tagged with #urgent"
- "What did I write about the project deadline?"

## Features

- **Ephemeral conversations**: Chats are cleared when you close the modal
- **Document context**: The AI receives your entire document as context
- **Custom system prompt**: Define how the AI should behave
- **Model selection**: Choose from GPT-4o, GPT-4o Mini, GPT-4 Turbo, or GPT-3.5 Turbo
- **Secure**: API key never exposed to the frontend

## Security Notes

### How Your API Key is Protected

1. **Separate Storage**: Your OpenAI API key is stored in a `secrets` collection, completely separate from your regular settings
2. **Never Sent to Browser**: The frontend NEVER queries or receives the raw API key
3. **Server-Only Access**: Only the serverless functions (`/api/save-key` and `/api/ask-ai`) can access the secrets collection
4. **Status Flag**: The UI shows "✓ Key saved" using a `hasAiKey` boolean flag, not the actual key
5. **Secure Transmission**: All requests use HTTPS and the key is only transmitted when you save it
6. **Server-Side AI Calls**: All OpenAI requests happen on the server; your key never appears in browser requests

### Database Collections

- **settings** (client-accessible): Contains `aiModel`, `aiSystemPrompt`, `hasAiKey` (boolean)
- **secrets** (server-only): Contains `aiApiKey` (never sent to client)

## Troubleshooting

**"No API key configured" error:**
- Make sure you've saved your OpenAI API key in Settings

**"Invalid API key" error:**
- Verify your OpenAI API key is correct
- Check that your OpenAI account has billing enabled

**AI not responding:**
- Check your browser console for errors
- Verify the Vercel function is deployed
- Ensure INSTANTDB_ADMIN_TOKEN is set in Vercel environment variables

**Chat doesn't appear:**
- Make sure you've run `npm install` after pulling the latest changes
- Clear your browser cache and reload

## Local Development

**Important:** The AI chat feature requires Vercel serverless functions to work. Local development options:

### Option 1: Deploy to Vercel Preview (Recommended)
1. Push your code to GitHub
2. Vercel will automatically create a preview deployment
3. Test the AI chat on the preview URL

### Option 2: Use Vercel CLI Locally
```bash
npm install -g vercel
vercel dev
```

This runs Vercel's development server locally with serverless functions enabled.

**Note:** The standard `npm run dev` will NOT work for AI chat because Vite doesn't run serverless functions. You'll see errors when trying to use the chat feature.

## Cost Considerations

- You pay for OpenAI API usage based on your own account
- GPT-4o is more expensive but more capable
- GPT-4o Mini is faster and cheaper
- Monitor your usage at [platform.openai.com/usage](https://platform.openai.com/usage)
