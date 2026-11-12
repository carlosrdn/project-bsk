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
const { rankRadar } = loadModule('radar-model.ts')
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
vm.runInContext(legacy + '\nglobalThis.__referenceAnalyze=analisar; globalThis.__referenceRadar=opcoesDoJogo; globalThis.__currentRound=rodadaAtual; globalThis.__manual=STATUS_SALVOS;', ctx,
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


const matches = data.jogos.map(game => ({ game, prediction: predictGame(game, data.media_liga.ataque, DEFAULT_PARAMS) }))
function compareRadar(injuries = data.lesoes_ok) {
 data.lesoes_ok = injuries
 const classic = data.jogos.flatMap(game => ctx.__referenceRadar(ctx.__referenceAnalyze(game, data.media_liga)))
   .sort((a, b) => b.score - a.score)
 const react = rankRadar(matches, { date: data.data_jogos, current: ctx.__currentRound(), injuries, manual: ctx.__manual })
 if (classic.length === 0 || react.length !== classic.length) throw Error('Radar: amostra vazia ou total de candidatos divergente')
 for (const [i, old] of classic.entries()) {
  const pick = react[i]
  const key = old.t.sigla + ' · ' + old.p.nome
  if (pick.player !== old.p.nome || pick.team.sigla !== old.t.sigla || pick.stat !== old.chave ||
      pick.eligible !== old.apta || JSON.stringify(pick.alerts) !== JSON.stringify(old.risco)) {
   throw Error('Radar: ordem, elegibilidade ou alertas divergentes para ' + key)
  }
  eq(key + ' projeção', pick.projected, old.proj)
  eq(key + ' oscilação', pick.deviation, old.sd)
  eq(key + ' nota', pick.score, old.score)
 }
 return react
}
const radar = compareRadar()
const excluded = radar[0]
ctx.__manual[[data.data_jogos, excluded.team.sigla, excluded.player].join('|')] = 'Fora'
if (compareRadar().some(pick => pick.player === excluded.player && pick.team.sigla === excluded.team.sigla)) {
 throw Error('Radar: ajuste manual não excluiu jogador fora')
}
data.data_jogos = '2000-01-01'
if (compareRadar(false).some(pick => pick.eligible)) throw Error('Radar: coleta antiga ou lesões indisponíveis deveria bloquear seleção')
console.log('OK: Radar equivalente ao BSK clássico para ' + radar.length + ' candidatos da coleta')

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
