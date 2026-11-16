import fs from 'node:fs'
import { createHash } from 'node:crypto'
import ts from 'typescript'
import path from 'node:path'
import { evaluateMarketReference } from './evaluate-market-reference.mjs'

const [, , input, snapshotPath] = process.argv
if (!input || !snapshotPath) throw Error('Uso: node scripts/calibrate.mjs replay.json jogos.json')
async function load(file) {
  const source = fs.readFileSync(new URL('../src/' + file, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext
  } })
  return import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'))
}
const { predictGame, DEFAULT_PARAMS } = await load('model.ts')
const { projectPlayer, thresholdChance } = await load('radar-model.ts')
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'))
const previous = snapshot.calibration
const cases = JSON.parse(fs.readFileSync(input, 'utf8')).filter(item => item.date < snapshot.data_jogos)
  .sort((a, b) => a.date.localeCompare(b.date))
const dates = [...new Set(cases.map(item => item.date))]
const lastValidation = snapshot.calibrationReport?.lastEvaluationThrough ?? previous?.validatedThrough ?? ''
const firstFresh = dates.findIndex(date => date > lastValidation)
const split = firstFresh === -1 ? dates.length : Math.max(Math.floor(dates.length * .7), firstFresh)
const train = cases.filter(item => item.date < dates[split])
const test = cases.filter(item => item.date >= dates[split])
const enough = dates.length >= 18 && dates.length - split >= 6 && train.length >= 60 && test.length >= 35 &&
  dates[split] > lastValidation
const average = (rows, metric) => rows.reduce((sum, row) => sum + metric(row), 0) / rows.length
const better = (candidate, incumbent) => candidate < incumbent * .995
const categories = { pts: 'PTS', reb: 'REB', ast: 'AST', tres: 'FG3M', blk: 'BLK', stl: 'STL' }
const next = structuredClone(previous ?? { players: {}, thresholds: {} })
const promoted = []

function teamMetrics(rows, tuning) {
  const predictions = rows.map(item => {
    const p = predictGame(item.game, item.league, { ...DEFAULT_PARAMS, ...tuning })
    return { p, actual: item.actual, baseline: item.baseline }
  })
  return {
    mae: average(predictions, ({ p, actual: [h, a] }) => (Math.abs(p.home - h) + Math.abs(p.away - a)) / 2),
    baseline: average(predictions, ({ baseline: [bh, ba], actual: [h, a] }) => (Math.abs(bh - h) + Math.abs(ba - a)) / 2),
    brier: average(predictions, ({ p, actual: [h, a] }) => (p.homeChance - Number(h > a)) ** 2)
  }
}

function playerRows(rows, stat) {
  return rows.flatMap(item => {
    const prediction = predictGame(item.game, item.league, { ...DEFAULT_PARAMS, ...next.team })
    return [true, false].flatMap(home => {
      const team = home ? item.game.casa : item.game.visitante
      const opponent = home ? item.game.visitante : item.game.casa
      return team.jogadores.flatMap(player => {
        const sample = player.props?.[stat]
        const actual = item.players[home ? 0 : 1][player.nome]?.[categories[stat]]
        return sample?.jogos >= 5 && Number.isFinite(actual) ? [{
          sample, actual, team, opponent, points: home ? prediction.home : prediction.away,
          margin: home ? prediction.margin : -prediction.margin, backToBack: player.back_to_back
        }] : []
      })
    })
  })
}
const project = (stat, row, tuning) => projectPlayer(stat, row.sample, row.team, row.opponent, row.points, row.margin, tuning, row.backToBack)

if (enough) {
  const incumbent = next.team ?? { fatigue: 0, sd: DEFAULT_PARAMS.sd }
  const count = rows => rows.filter(item => item.game.casa.back_to_back || item.game.visitante.back_to_back).length
  const fatigue = count(train) >= 12 && count(test) >= 6 ? [0, .75, 1.5, 2.25] : [incumbent.fatigue]
  const candidates = fatigue.flatMap(value => [10, 12, 14, 16, 18].map(sd => ({ fatigue: value, sd })))
  const chosen = candidates.map(tuning => ({ tuning, ...teamMetrics(train, tuning) }))
    .sort((a, b) => a.mae + 10 * a.brier - b.mae - 10 * b.brier)[0]
  const candidate = teamMetrics(test, chosen.tuning)
  const current = teamMetrics(test, incumbent)
  // Require a meaningful gain in at least one metric without harming the other.
  if (candidate.mae <= current.mae && candidate.mae <= candidate.baseline && candidate.brier <= current.brier &&
      (better(candidate.mae, current.mae) || better(candidate.brier, current.brier))) {
    next.team = chosen.tuning
    promoted.push('equipes')
  }

  if (promoted.includes('equipes') && next.team.fatigue !== incumbent.fatigue) next.thresholds = {}

  for (const stat of promoted.includes('equipes') ? [] : Object.keys(categories)) {
    const training = playerRows(train, stat)
    const validation = playerRows(test, stat)
    if (training.length < 250 || validation.length < 100) continue
    const current = next.players[stat]
    const mae = (rows, tuning) => average(rows, row => Math.abs(row.actual - project(stat, row, tuning).projected))
    const enoughBackToBack = training.filter(row => row.backToBack).length >= 35 && validation.filter(row => row.backToBack).length >= 15
    const fatigueOptions = enoughBackToBack ? [0, .025, .05] : [current?.fatigue ?? 0]
    const candidate = [0, .15, .3, .45].flatMap(recent => fatigueOptions.map(fatigue => ({ recent, fatigue })))
      .map(tuning => ({ tuning, mae: mae(training, tuning) })).sort((a, b) => a.mae - b.mae)[0].tuning
    const score = mae(validation, candidate)
    if (better(score, mae(validation, current)) && better(score, average(validation, row => Math.abs(row.actual - row.sample.media)))) {
      next.players[stat] = candidate
      // Residuals for an older player model cannot calibrate the new one.
      delete next.thresholds[stat]
      promoted.push(stat)
    }

    const tuning = next.players[stat]
    const residuals = training.map(row => {
      const p = project(stat, row, tuning)
      return (row.actual - p.projected) / p.deviation
    }).sort((a, b) => a - b)
    const quantiles = Array.from({ length: 99 }, (_, i) => residuals[Math.floor((i + 1) * residuals.length / 100)])
    const brier = distribution => average(validation, row => {
      const p = project(stat, row, tuning)
      const limits = [...new Set([-1, 0, 1].map(offset => Math.max(0, Math.floor(row.sample.media + offset * p.deviation))))]
      return average(limits, limit => (thresholdChance(p.projected, p.deviation, limit, distribution) - Number(row.actual > limit)) ** 2)
    })
    const calibrated = brier(quantiles)
    if (better(calibrated, brier(next.thresholds[stat])) && better(calibrated, brier(undefined))) {
      next.thresholds[stat] = quantiles
      promoted.push('limite:' + stat)
    }
  }
}

if (promoted.length) {
  next.trainedThrough = train.at(-1).date
  next.validatedThrough = test.at(-1).date
  delete next.version
  next.version = createHash('sha256').update(JSON.stringify(next)).digest('hex').slice(0, 12)
  snapshot.calibration = next
}
snapshot.calibrationReport = {
  games: cases.length, days: dates.length, trainGames: train.length, validationGames: test.length,
  validationFrom: test[0]?.date ?? null, validationThrough: test.at(-1)?.date ?? null,
  status: !enough ? 'amostra_insuficiente' : promoted.length ? 'promovido' : 'sem_ganho',
  lastEvaluationThrough: enough ? test.at(-1).date : lastValidation || null, promoted
}
function atomic(path, body) {
  const temp = path + '.calibration.tmp'
  fs.writeFileSync(temp, body)
  fs.renameSync(temp, path)
}
const marketReference = evaluateMarketReference(cases, snapshot.data_jogos,
  path.join(path.dirname(snapshotPath), 'mercados-bsk', 'referencia'))
delete snapshot.marketReference
atomic(snapshotPath.replace(/jogos\.json$/, 'dados.js'), 'const DADOS = ' + JSON.stringify(snapshot) + ';')
atomic(snapshotPath, JSON.stringify({ ...snapshot, marketReference }, null, 2) + '\n')
console.log(JSON.stringify({ ...snapshot.calibrationReport, marketReference }))
