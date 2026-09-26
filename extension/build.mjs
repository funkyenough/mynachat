// No bundler on purpose: tlsn-wasm spawns nested module workers via
// `new URL('./spawn.js', import.meta.url)` and `import('../../../tlsn_wasm.js')`,
// which bundlers tend to break. We ship our plain ES modules plus the untouched
// npm package under dist/tlsn/ and let Chrome load them natively.
import { cpSync, rmSync, mkdirSync } from 'node:fs';
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
console.log('built', dist);
