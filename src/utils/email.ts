// src/utils/email.ts
import { Resend } from 'resend';
import dotenv from 'dotenv';

dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

// Use your verified domain in production, sandbox for dev
const FROM_ADDRESS = process.env.RESEND_FROM || 'BusterBrackets <onboarding@resend.dev>';

export async function sendPasswordResetEmail(
  to: string,
  username: string,
  resetLink: string
): Promise<void> {
    try {
    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: 'BusterBrackets — Password Reset',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #333;">Password Reset Request</h2>
          <p>Hey there! We received a request to reset the password for your BusterBrackets account.</p>
          <p>As a reminder, your username is: <strong>${username}</strong></p>
          <p>
            <a href="${resetLink}" 
               style="display: inline-block; padding: 12px 24px; background-color: #1976D2; 
                      color: white; text-decoration: none; border-radius: 4px; font-weight: bold;">
              Reset My Password
            </a>
          </p>
          <p style="color: #666; font-size: 14px;">
            This link expires in 1 hour. If you didn't request this, you can safely ignore this email.
          </p>
          <p style="color: #999; font-size: 12px;">— The BusterBrackets Team 🏀</p>
        </div>
      `,
    });
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    throw error;
  }
}