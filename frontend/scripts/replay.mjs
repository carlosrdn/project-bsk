import fs from 'node:fs'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

async function load(file) {
  const source = await readFile(new URL('../src/' + file, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } })
  return import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'))
}

const [, , input, output] = process.argv
if (!input || !output) throw Error('Uso: node scripts/replay.mjs amostra.json resultado.json')
const { predictGame } = await load('model.ts')
const { projectPlayer } = await load('radar-model.ts')
const { createHash } = await import('node:crypto')
const fingerprint = async file => createHash('sha256').update(await readFile(new URL('../src/' + file, import.meta.url))).digest('hex')
const cases = JSON.parse(fs.readFileSync(input, 'utf8')).sort((a, b) => a.date.localeCompare(b.date))
if (!cases.length) throw Error('Amostra vazia')
const round = value => Math.round(value * 1000) / 1000
const mean = values => round(values.reduce((sum, value) => sum + value, 0) / values.length)
const stats = { pts: 'PTS', reb: 'REB', ast: 'AST', tres: 'FG3M' }
const rows = [], players = Object.fromEntries(Object.keys(stats).map(key => [key, []]))
const short = Object.fromEntries(Object.keys(stats).map(key => [key, []]))
for (const item of cases) {
  const { game, league, actual: [actualHome, actualAway], baseline: [baseHome, baseAway] } = item
  const p = predictGame(game, league)
  const won = Number(actualHome > actualAway)
  rows.push({
    mae: (Math.abs(p.home - actualHome) + Math.abs(p.away - actualAway)) / 2,
    baseMae: (Math.abs(baseHome - actualHome) + Math.abs(baseAway - actualAway)) / 2,
    total: Math.abs(p.total - actualHome - actualAway),
    baseTotal: Math.abs(baseHome + baseAway - actualHome - actualAway),
    winner: Number(Number(p.home >= p.away) === won),
    baseWinner: Number(Number(baseHome >= baseAway) === won),
    brier: (p.homeChance - won) ** 2,
    homeBrier: (0.5 - won) ** 2
  })
  for (const home of [true, false]) {
    const team = home ? game.casa : game.visitante
    const opponent = home ? game.visitante : game.casa
    for (const player of team.jogadores) {
      const actual = item.players[home ? 0 : 1][player.nome]
      if (!actual) continue
      for (const [key, column] of Object.entries(stats)) {
        const sample = player.props?.[key]
        if (!sample || sample.jogos < 5 || !Number.isFinite(actual[column])) continue
        const { projected } = projectPlayer(key, sample, team, opponent, home ? p.home : p.away, home ? p.margin : -p.margin)
        const row = [Math.abs(projected - actual[column]), Math.abs(sample.media - actual[column])]
        players[key].push(row)
        if (actual.MIN < 12) short[key].push(row)
      }
    }
  }
}
const summaries = data => Object.fromEntries(Object.entries(data).map(([key, sample]) => [key, {
  n: sample.length, model: sample.length ? mean(sample.map(row => row[0])) : null,
  baseline: sample.length ? mean(sample.map(row => row[1])) : null
}]))
const result = {
  schema: 1, source: 'ESPN', from: cases[0].date, to: cases.at(-1).date,
  games: cases.length, dates: new Set(cases.map(item => item.date)).size,
  modelSha256: await fingerprint('model.ts'), radarSha256: await fingerprint('radar-model.ts'),
  team: Object.fromEntries(Object.keys(rows[0]).map(key => [key, mean(rows.map(row => row[key]))])),
  players: summaries(players), shortMinutes: summaries(short)
}
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result, null, 2))
