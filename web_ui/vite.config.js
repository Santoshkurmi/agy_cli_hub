import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';

function configSyncPlugin() {
  return {
    name: 'config-sync',
    configureServer(server) {
      server.middlewares.use('/api/sync-policy', (req, res) => {
        if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const { policy } = JSON.parse(body);
              const configPath = '/home/cat/.gemini/config/config.json';
              if (fs.existsSync(configPath)) {
                const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                if (!cfg.userSettings) cfg.userSettings = {};
                cfg.userSettings.autoExecutionPolicy = policy;
                fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
              }
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true, policy }));
            } catch (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
          });
        } else {
          res.statusCode = 405;
          res.end();
        }
      });
    }
  };
}

function fileServerPlugin() {
  return {
    name: 'file-server',
    configureServer(server) {
      server.middlewares.use('/api/serve-file', (req, res) => {
        try {
          const urlObj = new URL(req.url, 'http://localhost');
          const filePath = urlObj.searchParams.get('path');
          if (!filePath || !fs.existsSync(filePath)) {
            res.statusCode = 404;
            res.end('File not found');
            return;
          }
          const ext = filePath.split('.').pop().toLowerCase();
          const mimeTypes = {
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            png: 'image/png',
            gif: 'image/gif',
            webp: 'image/webp',
            svg: 'image/svg+xml',
            bmp: 'image/bmp',
            webm: 'audio/webm',
            mp3: 'audio/mpeg',
            wav: 'audio/wav',
            ogg: 'audio/ogg',
            m4a: 'audio/mp4'
          };
          const contentType = mimeTypes[ext] || 'application/octet-stream';
          res.setHeader('Content-Type', contentType);
          res.setHeader('Cache-Control', 'public, max-age=3600');
          fs.createReadStream(filePath).pipe(res);
        } catch (err) {
          res.statusCode = 500;
          res.end(err.message);
        }
      });
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), configSyncPlugin(), fileServerPlugin()],
  server: {
    port: 5173
  }
});
