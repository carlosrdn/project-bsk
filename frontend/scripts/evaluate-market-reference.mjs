import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

const statKeys = { pts: 'PTS', reb: 'REB', ast: 'AST', tres: 'FG3M' }
const key = (start, home, away) => JSON.stringify([Date.parse(start), home, away])
const playerKey = name => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

export function evaluateMarketReference(cases, today, root) {
  const source = file => fs.readFileSync(new URL('../src/' + file, import.meta.url), 'utf8')
  const version = createHash('sha256').update(JSON.stringify(
    ['model.ts', 'radar-model.ts', 'market-lines.ts'].map(source)
  )).digest('hex')
  const categories = {}
  const days = fs.existsSync(root) ? fs.readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name) && entry.name < today)
    .map(entry => entry.name).sort() : []
  const results = new Map(cases.map(item => [key(item.game.horario_utc,
    item.game.casa.sigla, item.game.visitante.sigla), item]))
  const seen = new Set()
  const observations = Object.fromEntries(Object.keys(statKeys).map(stat => [stat, []]))
  for (const date of days) {
    const directory = path.join(root, date)
    for (const file of fs.readdirSync(directory).filter(name => name.endsWith('.json')).sort()) {
      const sample = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'))
      for (const pick of sample.picks) {
        if (pick.model !== version || !Object.hasOwn(statKeys, pick.stat) ||
            !(Date.parse(pick.collectedAt) <= Date.parse(pick.capturedAt) && Date.parse(pick.capturedAt) < Date.parse(pick.startsAt)) ||
            !Number.isFinite(pick.line) || pick.line % 1 !== .5 ||
            !Number.isFinite(pick.probability) || pick.probability < .55 || pick.probability > 1 ||
            !['Acima', 'Abaixo'].includes(pick.side)) continue
        const game = key(...JSON.parse(pick.game))
        const item = results.get(game)
        if (!item || item.date !== date) continue
        const side = pick.team === item.game.casa.sigla ? 0 : pick.team === item.game.visitante.sigla ? 1 : -1
        if (side < 0) continue
        const matches = Object.entries(item.players[side]).filter(([name]) => playerKey(name) === playerKey(pick.player))
        if (matches.length !== 1) continue
        const actual = matches[0][1][statKeys[pick.stat]]
        if (!Number.isFinite(actual)) continue
        const id = JSON.stringify([game, pick.team, playerKey(pick.player), pick.stat])
        if (seen.has(id)) continue
        seen.add(id)
        const hit = Number(pick.side === 'Acima' ? actual > pick.line : actual < pick.line)
        observations[pick.stat].push({ date, game, hit, loss: (pick.probability - hit) ** 2 })
      }
    }
  }
  for (const [stat, rows] of Object.entries(observations)) {
    const dates = new Set(rows.map(row => row.date)).size
    const games = new Set(rows.map(row => row.game)).size
    const settled = rows.length
    const hitRate = settled ? rows.reduce((sum, row) => sum + row.hit, 0) / settled : 0
    const brier = settled ? rows.reduce((sum, row) => sum + row.loss, 0) / settled : null
    categories[stat] = { games, dates, settled, hitRate, brier,
      approved: dates >= 6 && games >= 15 && settled >= 35 && hitRate >= .55 && brier < .25 }
  }
  return { version, through: days.at(-1) ?? '', categories }
}
