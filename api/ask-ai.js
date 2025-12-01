// Vercel serverless function to handle AI chat requests
// This keeps the user's API key secure on the backend

import { init } from '@instantdb/admin';

const APP_ID = 'e94c7dfa-ef77-4fe5-bb80-0cfdc96eb1c0';

// Initialize InstantDB admin (you'll need to set INSTANTDB_ADMIN_TOKEN in Vercel env vars)
const db = init({
  appId: APP_ID,
  adminToken: process.env.INSTANTDB_ADMIN_TOKEN,
});

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, question, documentContent } = req.body;

    // Validate inputs
    if (!userId || !question) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Fetch user's AI settings and secrets from InstantDB
    const [settingsResult, secretsResult] = await Promise.all([
      db.query({
        settings: {
          $: {
            where: {
              userId: userId,
            },
          },
        },
      }),
      db.query({
        secrets: {
          $: {
            where: {
              userId: userId,
            },
          },
        },
      }),
    ]);

    const settings = settingsResult.data?.settings || [];
    const secrets = secretsResult.data?.secrets || [];

    if (secrets.length === 0 || !secrets[0].aiApiKey) {
      return res.status(400).json({
        error: 'No API key configured. Please add your OpenAI API key in Settings.',
      });
    }

    const userSettings = settings.length > 0 ? settings[0] : {};
    const apiKey = secrets[0].aiApiKey;
    const model = userSettings.aiModel || 'gpt-4o';
    const systemPrompt =
      userSettings.aiSystemPrompt ||
      'You are a helpful assistant that analyzes my OneList document. Answer questions based on the document content. If you cannot find relevant information in the document, say so clearly.';

    // Build the messages for OpenAI
    const messages = [
      {
        role: 'system',
        content: systemPrompt,
      },
    ];

    // Add document context if available
    if (documentContent && documentContent.trim()) {
      // Limit document content to avoid token limits (optional: keep last 8000 chars)
      const truncatedContent =
        documentContent.length > 8000
          ? '...' + documentContent.slice(-8000)
          : documentContent;

      messages.push({
        role: 'system',
        content: `Here is the user's current document:\n\n${truncatedContent}`,
      });
    }

    // Add user question
    messages.push({
      role: 'user',
      content: question,
    });

    // Call OpenAI API
    const openAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!openAiResponse.ok) {
      const errorData = await openAiResponse.json();
      console.error('OpenAI API error:', errorData);
      
      // Check for specific error types
      if (errorData.error?.code === 'invalid_api_key') {
        return res.status(401).json({ error: 'Invalid API key. Please check your OpenAI API key in Settings.' });
      }
      
      throw new Error(errorData.error?.message || 'OpenAI API request failed');
    }

    const openAiData = await openAiResponse.json();

    // Extract the answer
    const answer = openAiData.choices?.[0]?.message?.content || 'No response from AI';

    // Return the answer to the frontend
    return res.status(200).json({ answer });
  } catch (error) {
    console.error('Error in ask-ai handler:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error',
    });
  }
}
