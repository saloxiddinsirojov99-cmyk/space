import { defineConfig, Plugin } from 'vite';
import * as fs from 'fs';
import * as path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';

function videoSavePlugin(): Plugin {
  return {
    name: 'video-save-plugin',
    configureServer(server) {
      server.middlewares.use('/api/save-video', (req: IncomingMessage, res: ServerResponse) => {
        if (req.method === 'POST') {
          const videosDir = path.resolve(process.cwd(), 'videos');
          if (!fs.existsSync(videosDir)) {
            fs.mkdirSync(videosDir, { recursive: true });
          }

          const chunks: Buffer[] = [];
          req.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
          });

          req.on('end', () => {
            const buffer = Buffer.concat(chunks);
            if (buffer.length > 0) {
              const now = new Date();
              const pad = (n: number) => n.toString().padStart(2, '0');
              const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
              const filename = `vid_${dateStr}.webm`;
              const filePath = path.join(videosDir, filename);

              fs.writeFileSync(filePath, buffer);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, file: filename }));
            } else {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Empty buffer' }));
            }
          });
        } else {
          res.writeHead(405);
          res.end();
        }
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
