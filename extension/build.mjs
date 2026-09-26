// No bundler on purpose: tlsn-wasm spawns nested module workers via
// `new URL('./spawn.js', import.meta.url)` and `import('../../../tlsn_wasm.js')`,
// which bundlers tend to break. We ship our plain ES modules plus the untouched
// npm package under dist/tlsn/ and let Chrome load them natively.
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, 'dist');
const tlsnDir = dirname(createRequire(import.meta.url).resolve('tlsn-wasm/package.json'));

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist);
cpSync(join(root, 'src'), dist, { recursive: true });
cpSync(join(root, '..', 'groups', 'catalog.json'), join(dist, 'catalog.json'));
cpSync(tlsnDir, join(dist, 'tlsn'), {
  recursive: true,
  dereference: true,
  filter: (p) => !p.endsWith('.d.ts') && !p.endsWith('README.md'),
});
// Hosted deployment (optional): APP_ORIGIN=https://demo.example.com VERIFIER_URL=wss://demo.example.com/verifier
// adds that origin to the content script and host permissions, and trusts that verifier.
const list = (v) => (v ?? '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
const origins = list(process.env.APP_ORIGIN);
const verifiers = list(process.env.VERIFIER_URL);
for (const o of origins) if (!/^https:\/\/[^/]+$/.test(o)) throw new Error(`APP_ORIGIN must be https://host, got ${o}`);
for (const v of verifiers) if (!/^wss:\/\/[^?#]+$/.test(v)) throw new Error(`VERIFIER_URL must be wss://..., got ${v}`);
if (origins.length || verifiers.length) {
  const manifestPath = join(dist, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.content_scripts[0].matches.push(...origins.map((o) => `${o}/*`));
  manifest.host_permissions.push(...origins.map((o) => `${o}/*`));
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(join(dist, 'config.js'), `export const ALLOWED_VERIFIERS = ${JSON.stringify(verifiers)};\n`);
}
console.log('built', dist, origins.length ? `for ${origins.join(', ')}` : '(localhost only)');
