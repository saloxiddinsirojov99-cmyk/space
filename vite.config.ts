import { defineConfig, Plugin } from 'vite';
import * as fs from 'fs';
import * as path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';

function videoSavePlugin(): Plugin {
  const videosDir = path.resolve(process.cwd(), 'videos');
  if (!fs.existsSync(videosDir)) {
    fs.mkdirSync(videosDir, { recursive: true });
  }

  return {
    name: 'video-save-plugin',
    configureServer(server) {
      // URL ni handler ICHIDA tekshiramiz — path prefix bilan use() ishlamasligi mumkin
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: Function) => {
        // Faqat /api/save-video ga kelgan POST so'rovlarni ushlaymiz
        const url = req.url?.split('?')[0]; // query string ni tashlash
        if (url !== '/api/save-video') {
          next();
          return;
        }

        // CORS
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
          console.error('[VideoSave] Stream error:', err.message);
          try {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Stream error' }));
          } catch { /* ignore */ }
        });

        req.on('end', () => {
          try {
            const buffer = Buffer.concat(chunks);
            if (buffer.length < 200) {
              console.warn(`[VideoSave] Rejected — too small: ${buffer.length} bytes`);
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
            console.log(`[VideoSave] ✅ Saved: ${filename}  (${(buffer.length/1024).toFixed(1)} KB)`);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, file: filename, bytes: buffer.length }));
          } catch (err: any) {
            console.error('[VideoSave] Write error:', err.message);
            try {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Write failed' }));
            } catch { /* ignore */ }
          }
        });
      });

      console.log(`[VideoSave] Plugin ready. Saving to: ${videosDir}`);
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
  build: {
    target: 'esnext'
  }
});
