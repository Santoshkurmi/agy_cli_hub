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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), configSyncPlugin()],
  server: {
    port: 5173
  }
});
