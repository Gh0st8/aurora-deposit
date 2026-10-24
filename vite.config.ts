import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { handleAurora } from "./api/aurora.ts";

/** Serves /api/aurora locally with the same handler Vercel runs in production. */
function auroraDevApi(apiKey: string | undefined): Plugin {
  return {
    name: 'aurora-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/aurora', async (req, res) => {
        const url = new URL(req.url || '/', 'http://x');
        const query = Object.fromEntries(url.searchParams.entries());
        let raw = '';
        for await (const chunk of req) raw += chunk;
        let body: unknown = {};
        try { body = raw ? JSON.parse(raw) : {}; } catch { /* ignore */ }
        const out = await handleAurora(query.op || '', query, body, apiKey);
        res.statusCode = out.status;
        res.setHeader('Content-Type', 'application/json');
        for (const [h, v] of Object.entries(out.headers || {})) res.setHeader(h, v);
        res.end(JSON.stringify(out.body));
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), auroraDevApi(env.AURORA_API_KEY)],
    define: { 'process.env': {} },
  };
});
