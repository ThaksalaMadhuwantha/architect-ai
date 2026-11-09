import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { connectDB } from './src/config/db.js';
import parserRoutes from './src/routes/parserRoutes.js';
import aiRoutes from './src/routes/aiRoutes.js';
import authRoutes from './src/routes/authRoutes.js';
import { apiLimiter } from './src/middleware/rateLimiters.js';
import dns from 'node:dns';

dns.setServers(['8.8.8.8', '1.1.1.1']);

dotenv.config();

// අත්‍යවශ්‍ය env variables නැත්නම් ආරම්භයේම නතර කරනවා
if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is missing in .env');
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 32) {
  console.warn('Warning: JWT_SECRET is short. Use at least 32 random characters.');
}

// MongoDB Database එක Connect කිරීම
connectDB();

const app = express();

app.use(helmet()); // security headers
// අවසර දුන් front-end origins පමණයි (කොමා වලින් වෙන් කරලා කීපයක් දාන්න පුළුවන්)
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((s) => s.trim());
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '100kb' }));
app.use('/api', apiLimiter);

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/parser', parserRoutes);
app.use('/api/v1/ai', aiRoutes);

app.get('/', (req, res) => {
  res.send('ArchitectAI Express Engine Running...');
});

// නොදන්නා route එකක් නම් JSON 404 එකක් (කලින් HTML එකක් ආවා)
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// Global error handler: JSON පමණයි, internal විස්තර එළියට යන්නේ නැහැ
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, error: 'ZIP file එක 50MB ට වඩා විශාලයි.' });
  }
  const status = err.status || err.statusCode || 500;
  if (status < 500) {
    return res.status(status).json({ success: false, error: err.expose ? err.message : 'Bad request' });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: 'Server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
