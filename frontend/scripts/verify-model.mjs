import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import * as ts from 'typescript'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
function loadModule(file) {
 const source = fs.readFileSync(path.join(root, 'frontend/src', file), 'utf8')
 const transpiled = ts.transpileModule(source, { compilerOptions: {
   module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022
 }}).outputText
 const exported = {}
 new Function('exports', 'module', transpiled)(exported, { exports: exported })
 return exported
}
const { predictGame, DEFAULT_PARAMS } = loadModule('model.ts')
const { rankRadar, projectPlayer } = loadModule('radar-model.ts')
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
const sampleTeam = {
 sigla: 'AAA', jogos: 12, vitorias_ultimos_10: 6, ataque: 111, defesa: 109, ritmo: 100,
 jogadores: [], ausencias: []
}
const comparisonGames = data.jogos.length ? data.jogos : [{ casa: sampleTeam, visitante: {...sampleTeam, sigla:'BBB'} }]
for (const game of comparisonGames) {
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
console.log('OK: projeções idênticas ao BSK clássico para '+comparisonGames.length+' jogos')


const stat = { media: 12, ultimos5: 12, jogos: 18, desvio: 4, minutos_media: 28 }
const game = { casa: {...sampleTeam, jogadores: [
 { nome: 'Atleta', situacao: 'Disponível', props: {
   // Nota superior pela amostra, mas acima do limite de variação do Radar.
   pts: { ...stat, media: 8, jogos: 24, ultimos5: 8, desvio: 8 },
   reb: { ...stat, media: 5, ultimos5: 5, jogos: 12, desvio: 3 }
 } }
]}, visitante: {...sampleTeam, sigla:'BBB'} }
const prediction = predictGame(game, 110, DEFAULT_PARAMS)
const matches = [{ game, prediction }]
const context = { date: '2026-11-12', current: true, injuries: true, manual: {} }
const radar = rankRadar(matches, context)
assert.equal(radar.length, 1)
assert.equal(radar[0].stat, 'reb')
assert.equal(radar[0].eligible, true)
assert.equal(rankRadar(matches, {...context, manual: {'2026-11-12|AAA|Atleta':'Fora'}}).length, 0)
assert.ok(rankRadar(matches, {...context, current: false}).every(pick => !pick.eligible))
assert.ok(rankRadar(matches, {...context, injuries: false}).every(pick => !pick.eligible))
const projected = sample => projectPlayer('pts', sample, game.casa, game.visitante, prediction.home, prediction.margin).projected
assert.equal(projected(stat), projected({...stat, minutos_ultimos5:null}))
assert.equal(projected(stat), projected({...stat, minutos_ultimos5:0}))
assert.ok(projected({...stat, minutos_ultimos5:14}) < projected(stat))
console.log('OK: Radar preserva categoria elegível e trata minutagem ausente')

const dataSource = fs.readFileSync(path.join(root, 'frontend/src/data.ts'), 'utf8')
const esm = ts.transpileModule(dataSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { validateSnapshot } = await import('data:text/javascript;base64,' + Buffer.from(esm).toString('base64'))
assert.equal(validateSnapshot(data), data)
assert.throws(() => validateSnapshot({...data, data_jogos:'2026-02-31'}))
assert.throws(() => validateSnapshot({...data, jogos:[null]}))
if (data.jogos.length) {
 const malformed = structuredClone(data)
 malformed.jogos[0].casa.jogadores = [null]
 assert.throws(() => validateSnapshot(malformed))
 assert.throws(() => validateSnapshot({...data, jogos:[data.jogos[0], data.jogos[0]]}))
}
console.log('OK: dados.js rejeita datas impossíveis, jogadores inválidos e confrontos duplicados')

const { buildLineup } = loadModule('lineup-model.ts')
const lineupTeam = {
 jogadores: [
  { nome: 'Fora no boletim', situacao: 'Disponível', posicao: 'PG', minutos: 36 },
  { nome: 'Armador reserva', posicao: 'G', minutos: 24 },
  { nome: 'Pivô', posicao: 'C', minutos: 28 },
  { nome: 'Ala', posicao: 'SF', minutos: 32 }
 ],
 ausencias: [{ nome: 'Fora no boletim', situacao: 'Fora', posicao: 'PG' }]
}
const box = [
 { name: 'Titular da ESPN', position: 'SG', status: 'Titular confirmado', minutes: 0 },
 { name: 'Fora no boletim', position: 'PG', minutes: 0 }
]
const lineup = buildLineup(lineupTeam, {}, box, [])
if (lineup.confirmed !== 1 || lineup.lineup[1].player?.name !== 'Titular da ESPN' ||
    lineup.lineup[4].player?.name !== 'Pivô' || lineup.lineup[0].player?.name !== 'Armador reserva' ||
    lineup.replacements[0]?.candidates[0]?.name !== 'Armador reserva') {
 throw Error('Escalações: quinteto, confirmação ou substituto incorreto')
}
const corrected = buildLineup(lineupTeam, { 'Fora no boletim': 'Titular confirmado', 'Armador reserva': 'Fora' }, box, [])
if (corrected.confirmed !== 2 || corrected.lineup[0].player?.name !== 'Fora no boletim' ||
    corrected.replacements.length !== 1 || corrected.replacements[0].absent.name !== 'Armador reserva') {
 throw Error('Escalações: ajuste manual não atualizou quinteto e desfalques')
}
console.log('OK: Escalações priorizam confirmações, posições, desfalques e ajustes manuais')
