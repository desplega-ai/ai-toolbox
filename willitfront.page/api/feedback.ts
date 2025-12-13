import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';
import { z } from 'zod';

const feedbackSchema = z.object({
  email: z.string().email(),
  message: z.string().min(1).max(5000),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.FEEDBACK_EMAIL;

  if (!apiKey || !toEmail) {
    return res.status(503).json({ error: 'Feedback not configured' });
  }

  const parseResult = feedbackSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid input', details: parseResult.error.issues });
  }

  const { email, message } = parseResult.data;

  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: toEmail,
      to: toEmail,
      cc: email,
      replyTo: email,
      subject: `[WIFP Feedback] from ${email}`,
      text: `From: ${email}\n\n${message}`,
    });

    return res.json({ success: true });
  } catch (error) {
    console.error('Feedback send error:', error);
    return res.status(500).json({ error: 'Failed to send feedback' });
  }
}
