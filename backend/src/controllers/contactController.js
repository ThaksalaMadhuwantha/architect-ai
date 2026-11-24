import nodemailer from 'nodemailer';
import ContactMessage from '../models/ContactMessage.js';

const escapeHtml = (str = '') =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const sendNotificationEmail = async ({ name, email, subject, message }) => {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const receiver = process.env.CONTACT_RECEIVER_EMAIL || user;

  if (!user || !pass || !receiver) {
    console.warn('SMTP_USER / SMTP_PASS not configured — skipping email notification (saved in MongoDB).');
    return false;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: `"ArchitectAI Contact" <${user}>`,
    to: receiver,
    replyTo: email,
    subject: `[ArchitectAI] ${subject} — from ${name}`,
    text: [
      `New Contact Message on ArchitectAI`,
      `------------------------------------`,
      `Name: ${name}`,
      `Email: ${email}`,
      `Topic: ${subject}`,
      ``,
      `Message:`,
      message,
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #070c24; color: #e2e8f0; padding: 24px; border-radius: 12px; border: 1px solid #1e3a8a;">
        <h2 style="color: #60a5fa; margin-top: 0;">New Contact Message — ArchitectAI</h2>
        <p style="margin: 8px 0;"><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p style="margin: 8px 0;"><strong>Email:</strong> <a href="mailto:${escapeHtml(email)}" style="color: #93c5fd;">${escapeHtml(email)}</a></p>
        <p style="margin: 8px 0;"><strong>Topic:</strong> ${escapeHtml(subject)}</p>
        <hr style="border: none; border-top: 1px solid #1e293b; margin: 16px 0;" />
        <p style="margin: 0 0 8px;"><strong>Message:</strong></p>
        <div style="background: #050816; padding: 14px; border-radius: 8px; white-space: pre-wrap; line-height: 1.6; color: #cbd5e1;">${escapeHtml(message)}</div>
      </div>
    `,
  });

  return true;
};

export const submitContactMessage = async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const subject = String(req.body?.subject || 'General Inquiry').trim();
    const message = String(req.body?.message || '').trim();

    if (!name || !email || !message) {
      return res.status(400).json({ success: false, error: 'Name, email, and message are required.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, error: 'Please provide a valid email address.' });
    }
    if (message.length > 3000) {
      return res.status(400).json({ success: false, error: 'Message must be under 3000 characters.' });
    }

    // 1. Save to MongoDB
    const saved = await ContactMessage.create({ name, email, subject, message });

    // 2. Send Email Notification (non-blocking if SMTP fails)
    let emailSent = false;
    try {
      emailSent = await sendNotificationEmail({ name, email, subject, message });
    } catch (mailErr) {
      console.error('Contact Email Notification Error:', mailErr.message);
    }

    return res.status(201).json({
      success: true,
      id: saved._id,
      emailSent,
      message: 'Message received! We will get back to you shortly.',
    });
  } catch (err) {
    console.error('Contact Submit Error:', err);
    return res.status(500).json({ success: false, error: 'Failed to submit message. Please try again later.' });
  }
};