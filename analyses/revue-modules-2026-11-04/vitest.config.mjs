import { fileURLToPath } from 'node:url';

const app = fileURLToPath(new URL('../../app/', import.meta.url));
export default {
  root: fileURLToPath(new URL('./', import.meta.url)),
  resolve: { alias: { '@': `${app}src`, vitest: `${app}node_modules/vitest/dist/index.js` } },
  test: { include: ['reproductions.test.ts'], environment: 'node' },
};
