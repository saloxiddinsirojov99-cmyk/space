import { defineConfig, Plugin } from 'vite';
import * as fs from 'fs';
import * as path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';

// @ts-ignore - CommonJS / ESM resolution in Vite config
import { dispatchAuditRoutes } from './server/auditSecurity.js';

function setupVideoSaveMiddleware(middlewares: any) {
  middlewares.use((req: IncomingMessage, res: ServerResponse, next: Function) => {
    if (dispatchAuditRoutes(req, res)) {
      return;
    }
    next();
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
      setupVideoSaveMiddleware(server.middlewares);
      console.log(`[VideoSave] Server tayyor. Videolar papkasi: ${videosDir}`);
    },
    configurePreviewServer(server) {
      setupVideoSaveMiddleware(server.middlewares);
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
