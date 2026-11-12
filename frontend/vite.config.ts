import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const projectDir = dirname(fileURLToPath(import.meta.url))

// Em desenvolvimento, serve os dados da raiz usados pelo site publicado em /novo/.
function legacyData(): Plugin {
  return {
    name: 'bsk-local-data',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split('?')[0]
        if (!path || (path !== '/dados.js' && !/^\/historico\/(?:(?:indice|metricas)|(?:snapshots|resultados)\/\d{4}-\d{2}-\d{2})\.json$/.test(path))) return next()
        try {
          const body = await readFile(resolve(projectDir, '..' + path), 'utf-8')
          res.setHeader('Content-Type', path.endsWith('.json') ? 'application/json; charset=utf-8' : 'application/javascript; charset=utf-8')
          res.end(body)
        } catch {
          res.statusCode = 404
          res.end('Arquivo indisponível')
        }
      })
    }
  }
}
export default defineConfig({
  base: '/project-bsk/novo/',
  plugins: [react(), legacyData()],
  build: { outDir: 'dist', emptyOutDir: true }
})
