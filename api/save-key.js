// Vercel serverless function to securely save API key
// Key is stored in a separate 'secrets' collection that the client never queries

import { init } from '@instantdb/admin';

const APP_ID = 'e94c7dfa-ef77-4fe5-bb80-0cfdc96eb1c0';

const db = init({
  appId: APP_ID,
  adminToken: process.env.INSTANTDB_ADMIN_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, apiKey } = req.body;

    if (!userId || !apiKey) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate API key format (basic check - starts with sk-)
    if (!apiKey.startsWith('sk-')) {
      return res.status(400).json({ error: 'Invalid API key format' });
    }

    // Check if secret already exists for this user
    const { data } = await db.query({
      secrets: {
        $: {
          where: {
            userId: userId,
          },
        },
      },
    });

    const existingSecrets = data?.secrets || [];

    if (existingSecrets.length > 0) {
      // Update existing secret
      const secretId = existingSecrets[0].id;
      await db.transact([
        {
          secrets: {
            [secretId]: {
              update: {
                aiApiKey: apiKey,
                updatedAt: Date.now(),
              },
            },
          },
        },
      ]);
    } else {
      // Create new secret
      const newSecretId = crypto.randomUUID();
      await db.transact([
        {
          secrets: {
            [newSecretId]: {
              update: {
                id: newSecretId,
                userId: userId,
                aiApiKey: apiKey,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              },
            },
          },
        },
      ]);
    }

    // Also update the settings to set hasAiKey = true
    const settingsQuery = await db.query({
      settings: {
        $: {
          where: {
            userId: userId,
          },
        },
      },
    });

    const existingSettings = settingsQuery.data?.settings || [];

    if (existingSettings.length > 0) {
      const settingsId = existingSettings[0].id;
      await db.transact([
        {
          settings: {
            [settingsId]: {
              update: {
                hasAiKey: true,
                updatedAt: Date.now(),
              },
            },
          },
        },
      ]);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error saving API key:', error);
    return res.status(500).json({
      error: error.message || 'Failed to save API key',
    });
  }
}
