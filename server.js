import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './src/config/db.js';
import parserRoutes from './src/routes/parserRoutes.js';
import aiRoutes from './src/routes/aiRoutes.js';
import dns from 'node:dns';

dns.setServers(['8.8.8.8', '1.1.1.1']);

dotenv.config();

// MongoDB Database එක Connect කිරීම
connectDB();

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/v1/parser', parserRoutes);
app.use('/api/v1/ai', aiRoutes);

app.get('/', (req, res) => {
  res.send('ArchitectAI Express Engine Running...');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});