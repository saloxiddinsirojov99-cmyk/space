import { defineConfig, Plugin } from 'vite';
import * as fs from 'fs';
import * as path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';

function videoSavePlugin(): Plugin {
  // Ensure videos directory exists at startup
  const videosDir = path.resolve(process.cwd(), 'videos');
  if (!fs.existsSync(videosDir)) {
    fs.mkdirSync(videosDir, { recursive: true });
  }

  return {
    name: 'video-save-plugin',
    configureServer(server) {
      server.middlewares.use('/api/save-video', (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        const chunks: Buffer[] = [];

        req.on('data', (chunk: Buffer) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        req.on('error', () => {
          try {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Stream error' }));
          } catch { /* ignore */ }
        });

        req.on('end', () => {
          try {
            if (chunks.length === 0) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'No data received' }));
              return;
            }

            const buffer = Buffer.concat(chunks);
            if (buffer.length < 100) {
              // Too small to be a valid video
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Buffer too small' }));
              return;
            }

            const now = new Date();
            const pad = (n: number) => n.toString().padStart(2, '0');
            const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
            const filename = `vid_${dateStr}.webm`;
            const filePath = path.join(videosDir, filename);

            fs.writeFileSync(filePath, buffer);
            console.log(`[VideoSave] Saved: ${filePath} (${(buffer.length / 1024).toFixed(1)} KB)`);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, file: filename, size: buffer.length }));
          } catch (err) {
            console.error('[VideoSave] Write error:', err);
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
