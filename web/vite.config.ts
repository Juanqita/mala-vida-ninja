import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

// BASE_PATH sirve para GitHub Pages (ej. "/mala-vida/"). En Render/Railway va "/".
const base = process.env.BASE_PATH ?? '/';

/**
 * Reemplaza __PUBLIC_URL__ en index.html por la URL pública del sitio. Sirve
 * para que la vista previa del link en WhatsApp muestre el logo: los crawlers
 * no ejecutan JavaScript, así que la imagen tiene que ir con URL absoluta.
 *
 * Define VITE_PUBLIC_URL al compilar, ej:
 *   VITE_PUBLIC_URL=https://juega.malavida.co npm run build
 */
function publicUrlPlugin(): Plugin {
  const url = (process.env.VITE_PUBLIC_URL ?? '').replace(/\/$/, '');
  return {
    name: 'mala-vida-public-url',
    transformIndexHtml(html) {
      return html.replaceAll('__PUBLIC_URL__', url);
    },
  };
}

export default defineConfig({
  base,
  plugins: [react(), tailwindcss(), publicUrlPlugin()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  server: {
    port: Number(process.env.PORT ?? 5173),
    host: true,
    proxy: {
      // En desarrollo el juego llama a /api y Vite lo reenvía al servidor.
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: { phaser: ['phaser'] },
      },
    },
  },
});
