import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import * as ts from 'typescript'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const source = fs.readFileSync(path.join(root, 'frontend/src/model.ts'), 'utf8')
const transpiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022
}}).outputText
const exported = {}
new Function('exports', 'module', transpiled)(exported, { exports: exported })
const { predictGame, DEFAULT_PARAMS } = exported
const raw = fs.readFileSync(path.join(root, 'dados.js'), 'utf8')
const data = JSON.parse(raw.replace(/^\s*const\s+DADOS\s*=\s*/, '').replace(/;\s*$/, ''))
const values = { wHome: 2.5, wForm: 1.5, K: 12, sd: 12, kInj: 0.12 }
const document = {
 body: { dataset: { page: 'escalacoes' } },
 getElementById(id) { return { value: String(values[id] ?? ''), textContent: '', innerHTML: '',
   addEventListener() {}, classList: { add() {}, remove() {} } } },
 addEventListener() {}, querySelectorAll: () => []
}
const ctx = vm.createContext({DADOS:data,document,localStorage:{getItem:()=>null,setItem(){}},
 setInterval(){},setTimeout(){},console,Intl,Date,Math})
const legacy = fs.readFileSync(path.join(root, 'bsk.js'), 'utf8')
vm.runInContext(legacy + '\nglobalThis.__referenceAnalyze=analisar;', ctx,
 { filename: 'bsk.js', timeout: 15000 })
const eq = (label, a, b) => {
 if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a-b)>1e-9)
  throw Error(label + ': React=' + a + ' clássico=' + b)
}
if (!data.jogos.length) throw Error('dados.js sem jogos; comparação inconclusiva')
for (const game of data.jogos) {
 const old = ctx.__referenceAnalyze(game, data.media_liga)
 const next = predictGame(game, data.media_liga.ataque, DEFAULT_PARAMS)
 const key = game.visitante.sigla + ' × ' + game.casa.sigla
 for (const [label,a,b] of [
  ['mandante',next.home,old.sc],['visitante',next.away,old.sv],
  ['total',next.total,old.sc+old.sv],['margem',next.margin,old.margem],
  ['chance',next.homeChance,old.pc],
  ['impacto mandante',next.injuryHome,old.impC],['impacto visitante',next.injuryAway,old.impV]
 ]) eq(key + ' ' + label,a,b)
 if(next.favorite!==old.fav.sigla) throw Error(key + ': favorito divergente')
}
console.log('OK: projeções idênticas ao BSK clássico para '+data.jogos.length+' jogos')
