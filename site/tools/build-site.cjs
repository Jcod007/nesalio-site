// Publish only intended public pages and assets; never repository source or reports.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'site-dist');
if (path.dirname(output) !== root || path.basename(output) !== 'site-dist') throw new Error('Invalid public output directory');
fs.rmSync(output, { recursive: true, force: true });

const files = [
  'index.html', 'en.html', 'confidentialite.html', 'mascotte.html', 'nesa.js',
  'favicon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png',
  'og-image-maths.png', 'robots.txt', 'sitemap.xml', 'llms.txt',
  'articles/index.html', 'articles/chatgpt-devoirs.html', 'articles/expliquer-en-dessinant.html',
  'articles/tutorat-efficace.html', 'articles/bien-etudier.html',
  'videos/seance-quad-v3.jpg', 'videos/seance-quad-v3.mp4', 'videos/seance-quad-v3.webm',
];
for (const file of files) {
  const destination = path.join(output, file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(root, file), destination);
}
console.log(`${files.length} public files prepared in site-dist/`);
