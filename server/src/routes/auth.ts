import { Router, Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
);

export const authRouter = Router();

// Step 1: Generate the Google OAuth consent URL
authRouter.get('/google/url', (_req: Request, res: Response) => {
  const authorizeUrl = client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
  });
  res.json({ url: authorizeUrl });
});

// Step 2: Handle the OAuth callback — exchange code for tokens
authRouter.post('/google/callback', async (req: Request, res: Response) => {
  const { code } = req.body;

  if (!code || typeof code !== 'string') {
    res.status(400).json({ error: 'Authorization code is required' });
    return;
  }

  try {
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // Verify the ID token and extract user info
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token!,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    res.json({
      user: {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
      },
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
    });
  } catch (err) {
    res.status(401).json({
      error: 'Authentication failed',
      details: err instanceof Error ? err.message : 'Unknown error',
    });
  }
});

// Verify an existing token
authRouter.get('/verify', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    res.json({
      user: {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
      },
    });
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});
