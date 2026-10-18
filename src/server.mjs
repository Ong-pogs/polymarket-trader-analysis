// Serves the results page on this computer only. It reads data/results.json, which src/study.mjs writes, so opening
// the page never calls Predictefy and costs no credits.
import {createServer} from 'node:http';
import {existsSync, readFileSync, statSync} from 'node:fs';
import {resolve, extname, sep} from 'node:path';
import {project, local} from './predictefy.mjs';

const port = Number(process.env.STUDY_PORT || local.STUDY_PORT || 8819);
if (!Number.isInteger(port) || port < 1024 || port > 65535) { console.error('STUDY_PORT must be a port between 1024 and 65535.'); process.exit(1); }
const dataDir = resolve(project, process.env.STUDY_DATA || 'data');
const resultsFile = resolve(dataDir, 'results.json');
const web = resolve(project, 'web');
const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json; charset=utf-8'};
// Handles are the public names on Polymarket's own leaderboard. STUDY_HIDE_HANDLES=1 shows shortened addresses only.
const hideHandles = process.env.STUDY_HIDE_HANDLES === '1';

function results() {
  if (!existsSync(resultsFile)) return null;
  const data = JSON.parse(readFileSync(resultsFile, 'utf8'));
  if (hideHandles) {
    for (const rows of Object.values(data.boards || {})) for (const row of rows) row.handle = null;
    for (const book of data.books || []) book.handle = null;
    for (const list of Object.values(data.flips || {})) for (const row of list) row.handle = null;
  }
  return data;
}

const server = createServer((request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  const send = (status, type, body) => { response.writeHead(status, {'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff'}); response.end(body); };
  if (request.method !== 'GET') return send(405, 'text/plain; charset=utf-8', 'Read-only');
  if (url.pathname === '/api/results') {
    const data = results();
    return data ? send(200, types['.json'], JSON.stringify(data)) : send(404, types['.json'], JSON.stringify({error: 'No study has been run yet. Run: node src/study.mjs'}));
  }
  const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const target = resolve(web, name);
  if (!target.startsWith(web + sep) || !existsSync(target) || !statSync(target).isFile()) return send(404, 'text/plain; charset=utf-8', 'Not found');
  send(200, types[extname(target)] || 'application/octet-stream', readFileSync(target));
});
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is in use. Set STUDY_PORT to another port.` : error.message); process.exit(1); });
server.listen(port, '127.0.0.1', () => {
  const data = results();
  console.log(data ? `Results of ${String(data.takenAt?.boards || data.generatedAt).slice(0, 16).replace('T', ' ')} UTC` : 'No study saved yet. Run: node src/study.mjs');
  console.log(`Open http://127.0.0.1:${port}`);
});
