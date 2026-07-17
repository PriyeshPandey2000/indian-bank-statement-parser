import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import uploadRouter from './routes/upload';
import documentRouter from './routes/document';

const app = express();
const PORT = Number(process.env['PORT']) || 8000;

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) { cb(null, true); return; }
    try {
      const { hostname } = new URL(origin);
      if (hostname === 'localhost' || hostname === '127.0.0.1' || origin === process.env.ALLOWED_ORIGIN) {
        cb(null, true); return;
      }
    } catch {}
    cb(new Error(`CORS blocked: ${origin}`));
  }
}));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const STORAGE_ROOT = path.resolve(__dirname, '../storage');
app.get('/api/documents', (_req, res) => {
  try {
    if (!fs.existsSync(STORAGE_ROOT)) { res.json([]); return; }
    const docs = fs.readdirSync(STORAGE_ROOT)
      .map(id => {
        const metaPath = path.join(STORAGE_ROOT, id, 'metadata.json');
        if (!fs.existsSync(metaPath)) return null;
        return JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as { documentId: string; filename: string; createdAt: string };
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b!.createdAt).getTime() - new Date(a!.createdAt).getTime());
    res.json(docs);
  } catch (e) {
    res.json([]);
  }
});

app.use('/api/upload', uploadRouter);
app.use('/api/document', documentRouter);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
