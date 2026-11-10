import { createServer } from 'node:http';
import { buildHtml } from './build.mjs';
import { checkout } from '../examples/checkout.mjs';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { enterprise } from '../examples/enterprise.mjs';

const port = Number(process.env.PORT ?? 4173);
const server = createServer(async (request, response) => {
  const pathname = request.url?.split('?')[0];
  if (pathname === '/favicon.ico') { response.writeHead(204); response.end(); return; }
  if (pathname === '/' || pathname === '/index.html' || pathname === '/agent-tools.json' || pathname.startsWith('/assets/') || pathname.startsWith('/examples/')) {
    const base = resolve(new URL('../dist/', import.meta.url).pathname);
    let path;
    try { path = resolve(base, decodeURIComponent(pathname === '/' ? 'index.html' : pathname.slice(1))); }
    catch { response.writeHead(400); response.end('Invalid path'); return; }
    if (!path.startsWith(base + sep)) { response.writeHead(403); response.end('Forbidden'); return; }
    try {
      if (!(await stat(path)).isFile()) throw new Error('Not a file');
      const mime = { html: 'text/html; charset=utf-8', css: 'text/css', mjs: 'text/javascript', json: 'application/json', svg: 'image/svg+xml', gif: 'image/gif', png: 'image/png' }[path.split('.').pop()] ?? 'application/octet-stream';
      const contents = await readFile(path); response.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store' }); response.end(contents);
    } catch { response.writeHead(404); response.end('Run npm run build first.'); }
    return;
  }
  if (['/output-targets.html', '/capture-loop-document.svg'].includes(pathname)) {
    try { response.writeHead(200, { 'Content-Type': pathname.endsWith('.svg') ? 'image/svg+xml' : 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(await readFile(new URL(`../dist${pathname}`, import.meta.url))); }
    catch { response.writeHead(404); response.end('Run npm run build first.'); }
    return;
  }
  if (!['/', '/checkout.html', '/enterprise.html'].includes(pathname)) { response.writeHead(404); response.end('Not found'); return; }
  try { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(await buildHtml(pathname === '/enterprise.html' ? enterprise : checkout)); }
  catch (error) { console.error(error); response.writeHead(500); response.end('Build failed; inspect terminal.'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Software Anatomy: http://127.0.0.1:${port}`));
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
