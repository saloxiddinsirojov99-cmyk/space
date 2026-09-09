import { defineConfig, Plugin } from 'vite';
import * as fs from 'fs';
import * as path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';

function setupVideoSaveMiddleware(middlewares: any, videosDir: string) {
  middlewares.use((req: IncomingMessage, res: ServerResponse, next: Function) => {
    const rawUrl = (req.url || '').split('?')[0];
    
    // /api/save-video yoki /save-video ga kelgan so'rovlarni ushlaymiz
    if (!rawUrl.includes('save-video')) {
      next();
      return;
    }

    // CORS barcha so'rovlar uchun
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    const chunks: Buffer[] = [];

    req.on('data', (chunk: Buffer) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    req.on('error', (err: Error) => {
      console.error('[VideoSave] Stream xatosi:', err.message);
      try {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Stream error' }));
      } catch { /* ignore */ }
    });

    req.on('end', () => {
      try {
        const buffer = Buffer.concat(chunks);
        if (buffer.length < 200) {
          console.warn(`[VideoSave] Qabul qilinmadi — hajmi juda kichik: ${buffer.length} bayt`);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Too small', size: buffer.length }));
          return;
        }

        const now = new Date();
        const pad = (n: number) => n.toString().padStart(2, '0');
        const ts = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
        const filename = `vid_${ts}.webm`;
        const filePath = path.join(videosDir, filename);

        fs.writeFileSync(filePath, buffer);
        console.log(`[VideoSave] ✅ Muvaffaqiyatli saqlandi: ${filename}  (${(buffer.length/1024).toFixed(1)} KB)`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, file: filename, bytes: buffer.length }));
      } catch (err: any) {
        console.error('[VideoSave] Faylga yozishda xatolik:', err.message);
        try {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Write failed' }));
        } catch { /* ignore */ }
      }
    });
  });
}

function videoSavePlugin(): Plugin {
  const videosDir = path.resolve(process.cwd(), 'videos');
  if (!fs.existsSync(videosDir)) {
    fs.mkdirSync(videosDir, { recursive: true });
  }

  return {
    name: 'video-save-plugin',
    configureServer(server) {
      setupVideoSaveMiddleware(server.middlewares, videosDir);
      console.log(`[VideoSave] Server tayyor. Videolar papkasi: ${videosDir}`);
    },
    configurePreviewServer(server) {
      setupVideoSaveMiddleware(server.middlewares, videosDir);
      console.log(`[VideoSave] Preview server tayyor. Videolar papkasi: ${videosDir}`);
    }
  };
}

export default defineConfig({
  plugins: [videoSavePlugin()],
  server: {
    host: true,
    port: 5173,
    open: true
  },
  preview: {
    host: true,
    port: 4173
  },
  build: {
    target: 'esnext'
  }
});
