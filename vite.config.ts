import { defineConfig, type Plugin, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import type { ServerResponse } from 'node:http'

const ROOT = __dirname
const SCENE_FILE = path.join(ROOT, 'scene.json')
const ASSETS_DIR = path.join(ROOT, 'assets')

/**
 * Bridges the on-disk project (scene.json + assets/) and the browser UI.
 *
 * - GET  /api/scene         -> current scene.json (404 if absent)
 * - POST /api/scene         -> overwrite scene.json (UI autosave)
 * - GET  /api/scene/events  -> SSE; fires when scene.json changes on disk
 *                              (e.g. edited by Claude Code) but NOT for
 *                              writes made through POST /api/scene
 * - POST /api/assets        -> save an uploaded file into assets/, returns its URL
 * - GET  /api/assets        -> list asset URLs
 * - GET  /assets/*          -> serve asset files
 */
function projectBridge(): Plugin {
  let lastUiWrite = ''
  const sseClients = new Set<ServerResponse>()

  const readBody = (req: NodeJS.ReadableStream): Promise<Buffer> =>
    new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => resolve(Buffer.concat(chunks)))
      req.on('error', reject)
    })

  return {
    name: 'vectorsmith-project-bridge',
    configureServer(server: ViteDevServer) {
      if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true })

      server.watcher.add(SCENE_FILE)
      const onFsEvent = (file: string) => {
        if (path.resolve(file) !== SCENE_FILE) return
        let content = ''
        try {
          content = fs.readFileSync(SCENE_FILE, 'utf8')
        } catch {
          return
        }
        if (content === lastUiWrite) return
        for (const res of sseClients) res.write(`data: change\n\n`)
      }
      server.watcher.on('change', onFsEvent)
      server.watcher.on('add', onFsEvent)

      server.middlewares.use(async (req, res, next) => {
        const url = (req.url ?? '').split('?')[0]

        if (url === '/api/scene' && req.method === 'GET') {
          if (!fs.existsSync(SCENE_FILE)) {
            res.statusCode = 404
            res.end('no scene')
            return
          }
          res.setHeader('Content-Type', 'application/json')
          res.end(fs.readFileSync(SCENE_FILE, 'utf8'))
          return
        }

        if (url === '/api/scene' && req.method === 'POST') {
          const body = (await readBody(req)).toString('utf8')
          try {
            const pretty = JSON.stringify(JSON.parse(body), null, 2) + '\n'
            lastUiWrite = pretty
            fs.writeFileSync(SCENE_FILE, pretty)
            res.end('ok')
          } catch {
            res.statusCode = 400
            res.end('invalid json')
          }
          return
        }

        if (url === '/api/scene/events' && req.method === 'GET') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          })
          res.write(': connected\n\n')
          sseClients.add(res)
          req.on('close', () => sseClients.delete(res))
          return
        }

        if (url === '/api/assets' && req.method === 'POST') {
          const name = decodeURIComponent(
            (req.headers['x-filename'] as string) || `asset-${Date.now()}.png`,
          )
          const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_')
          const data = await readBody(req)
          let final = safe
          let i = 1
          while (fs.existsSync(path.join(ASSETS_DIR, final))) {
            const ext = path.extname(safe)
            final = `${path.basename(safe, ext)}-${i++}${ext}`
          }
          fs.writeFileSync(path.join(ASSETS_DIR, final), data)
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ url: `/assets/${final}` }))
          return
        }

        if (url === '/api/assets' && req.method === 'GET') {
          const files = fs.existsSync(ASSETS_DIR) ? fs.readdirSync(ASSETS_DIR) : []
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(files.map((f) => `/assets/${f}`)))
          return
        }

        if (url.startsWith('/assets/') && req.method === 'GET') {
          const file = path.join(ASSETS_DIR, path.normalize(url.slice('/assets/'.length)))
          if (!file.startsWith(ASSETS_DIR) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
            res.statusCode = 404
            res.end('not found')
            return
          }
          const types: Record<string, string> = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.svg': 'image/svg+xml',
          }
          res.setHeader('Content-Type', types[path.extname(file).toLowerCase()] ?? 'application/octet-stream')
          res.end(fs.readFileSync(file))
          return
        }

        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), projectBridge()],
  server: { port: 5173 },
})
