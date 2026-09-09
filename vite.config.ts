import { defineConfig, Plugin } from 'vite';
import * as fs from 'fs';
import * as path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';

function videoSavePlugin(): Plugin {
  // videos/ papkasini server start bo'lganda yaratish
  const videosDir = path.resolve(process.cwd(), 'videos');
  if (!fs.existsSync(videosDir)) {
    fs.mkdirSync(videosDir, { recursive: true });
  }
  console.log(`[VideoSave] Videos will be saved to: ${videosDir}`);

  return {
    name: 'video-save-plugin',
    configureServer(server) {
      server.middlewares.use('/api/save-video', (req: IncomingMessage, res: ServerResponse) => {
        // CORS headers (sendBeacon ham ishlashi uchun)
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
        let totalSize = 0;

        req.on('data', (chunk: Buffer) => {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          chunks.push(buf);
          totalSize += buf.length;
        });

        req.on('error', (err) => {
          console.error('[VideoSave] Request stream error:', err.message);
          try {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Stream error' }));
          } catch { /* ignore */ }
        });

        req.on('end', () => {
          try {
            if (chunks.length === 0 || totalSize < 200) {
              console.warn(`[VideoSave] Rejected: too small (${totalSize} bytes)`);
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Too small', size: totalSize }));
              return;
            }

            const buffer = Buffer.concat(chunks);
            const now = new Date();
            const pad = (n: number) => n.toString().padStart(2, '0');
            const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
            const filename = `vid_${dateStr}.webm`;
            const filePath = path.join(videosDir, filename);

            fs.writeFileSync(filePath, buffer);
            console.log(`[VideoSave] ✅ Saved: ${filename} (${(buffer.length / 1024).toFixed(1)} KB)`);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, file: filename, size: buffer.length }));
          } catch (err: any) {
            console.error('[VideoSave] Write error:', err.message);
            try {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Write failed' }));
            } catch { /* ignore */ }
          }
        });
      });
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
