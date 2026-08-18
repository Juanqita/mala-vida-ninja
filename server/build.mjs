import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const outdir = 'dist';

await build({
  entryPoints: ['src/index.ts'],
  outfile: path.join(outdir, 'index.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  sourcemap: true,
  banner: {
    // pg y drizzle usan require() internamente en algunos paths
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
  external: ['pg-native'],
});

// El panel admin viaja junto al bundle.
fs.mkdirSync(path.join(outdir, 'admin'), { recursive: true });
fs.copyFileSync('src/admin/panel.html', path.join(outdir, 'admin/panel.html'));

// El frontend compilado (si existe) se copia para servirlo desde el mismo proceso.
const webDist = path.resolve('../web/dist');
if (fs.existsSync(path.join(webDist, 'index.html'))) {
  fs.cpSync(webDist, path.join(outdir, 'public'), { recursive: true });
  console.log('Frontend copiado a server/dist/public');
}

console.log('Build listo →', path.resolve(outdir, 'index.mjs'));
