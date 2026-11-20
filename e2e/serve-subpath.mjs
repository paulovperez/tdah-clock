// Serves dist/ under /tdah-clock/ — mimics GitHub Pages project sites for testing.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const BASE = '/tdah-clock/'
const ROOT = join(process.cwd(), 'dist')
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.json': 'application/json' }

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (!path.startsWith(BASE)) { res.writeHead(404).end('not found'); return }
  let rel = normalize(path.slice(BASE.length)).replace(/^(\.\.[/\\])+/, '')
  if (!rel || rel.endsWith('/') || rel === '.') rel = join(rel, 'index.html')
  try {
    const body = await readFile(join(ROOT, rel))
    res.writeHead(200, { 'content-type': TYPES[extname(rel)] ?? 'application/octet-stream' }).end(body)
  } catch { res.writeHead(404).end('not found') }
}).listen(Number(process.env.PORT ?? 4174), () => console.log('serving on http://localhost:4174' + BASE))
