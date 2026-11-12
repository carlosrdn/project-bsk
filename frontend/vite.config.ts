import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// Em desenvolvimento, disponibiliza o mesmo dados.js da raiz do projeto.
// Em produção, o frontend compilado em /novo/ lê ../dados.js.
function legacyData(): Plugin {
  return {
    name: 'bsk-local-data',
    configureServer(server) {
      server.middlewares.use('/dados.js', async (_req, res) => {
        try {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
          res.end(await readFile(resolve(__dirname, '../dados.js'), 'utf-8'))
        } catch {
          res.statusCode = 503
          res.end('dados.js indisponível')
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
