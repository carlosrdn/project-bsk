import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import ts from 'typescript'

const [, , snapshotFile, linesFile, outputDirectory] = process.argv
if (!snapshotFile || !linesFile || !outputDirectory) throw Error('Informe snapshot, linhas e diretório de saída.')
const source = file => fs.readFileSync(new URL('../src/' + file, import.meta.url), 'utf8')
const compile = code => ts.transpileModule(code, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext
} }).outputText
const moduleUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
const modelCode = source('model.ts')
const radarCode = source('radar-model.ts')
const marketCode = source('market-lines.ts')
const { predictGame, DEFAULT_PARAMS } = await import(moduleUrl(compile(modelCode)))
const { selectRecommendations } = await import(moduleUrl(compile(marketCode)
  .replace("'./radar-model'", JSON.stringify(moduleUrl(compile(radarCode))))))
const { isRadarSignal } = await import(moduleUrl(compile(source('radar-signal.ts'))))
const { validateSnapshot, nbaToday } = await import(moduleUrl(compile(source('data.ts'))))

const snapshot = validateSnapshot(JSON.parse(fs.readFileSync(snapshotFile, 'utf8')))
const feed = JSON.parse(fs.readFileSync(linesFile, 'utf8'))
const now = Date.now()
const nowIso = new Date(now).toISOString()
if (snapshot.data_jogos !== nbaToday()) throw Error('O snapshot ESPN não corresponde à data atual da NBA.')
if (!Array.isArray(feed.lines) || !Number.isFinite(Date.parse(feed.collectedAt))) throw Error('Feed de linhas inválido.')

const version = createHash('sha256').update(JSON.stringify([modelCode, radarCode, marketCode])).digest('hex')
const directory = path.join(outputDirectory, 'historico')
const history = path.join(directory, snapshot.data_jogos + '.json')
fs.mkdirSync(directory, { recursive: true })
const archive = fs.existsSync(history) ? JSON.parse(fs.readFileSync(history, 'utf8')) : {
  date: snapshot.data_jogos, picks: []
}
const frozen = new Set(archive.picks.filter(isRadarSignal).map(pick => pick.game))
const gameKey = game => JSON.stringify([game.horario_utc, game.casa.sigla, game.visitante.sigla])
const pending = snapshot.jogos.filter(game => {
  const start = Date.parse(game.horario_utc)
  return start > now + 5 * 60_000
}).map(game => ({ game, prediction: predictGame(game, snapshot.media_liga.ataque,
  { ...DEFAULT_PARAMS, ...snapshot.calibration?.team }) }))
const categories = ['pts', 'reb', 'ast', 'tres']
const matches = pending.filter(({ game }) => !frozen.has(gameKey(game)))
const referenceMatches = pending.map(({ game }) => ({
  game, prediction: predictGame(game, snapshot.media_liga.ataque, DEFAULT_PARAMS)
}))
const reference = selectRecommendations(referenceMatches, snapshot, feed, now, categories, true)
const approval = snapshot.marketReference
const approved = approval?.version === version && approval.through < snapshot.data_jogos
  ? categories.filter(stat => approval.categories[stat]?.approved === true && !snapshot.calibration?.thresholds[stat])
  : []
const fallback = reference.filter(pick => approved.includes(pick.stat) && !frozen.has(gameKey(pick.game)))
const chosen = new Map()
const official = selectRecommendations(matches, snapshot, feed, now)
for (const pick of [...official, ...fallback]) {
  if (!isRadarSignal({ ...pick, projection: pick.projected, sample: pick.sample.jogos })) continue
  const key = JSON.stringify([gameKey(pick.game), pick.team.sigla, pick.player])
  if (!chosen.has(key)) chosen.set(key, pick)
}
const archivePick = (pick, calibration) => ({
  game: gameKey(pick.game), startsAt: pick.game.horario_utc,
  player: pick.player, team: pick.team.sigla, stat: pick.stat, line: pick.line,
  side: pick.side, probability: pick.probability, sample: pick.sample.jogos, projection: pick.projected,
  capturedAt: nowIso, collectedAt: feed.collectedAt, snapshotAt: snapshot.atualizado_em,
  calibration, model: version
})
const picks = [...chosen.values()].slice(0, 6).map(pick => archivePick(
  pick, official.includes(pick) ? snapshot.calibration.version : 'referencia'
))
function write(file, data) {
  const temporary = file + '.tmp'
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2) + '\n')
  fs.renameSync(temporary, file)
}
const samples = path.join(outputDirectory, 'linhas', snapshot.data_jogos)
fs.mkdirSync(samples, { recursive: true })
const capture = path.join(samples, new Date(feed.collectedAt).toISOString().replaceAll(':', '-') + '.json')
if (!fs.existsSync(capture)) write(capture, {
  collectedAt: feed.collectedAt,
  lines: feed.lines.filter(line => Date.parse(line.start) > Date.parse(feed.collectedAt))
})
const shadows = path.join(outputDirectory, 'referencia', snapshot.data_jogos)
fs.mkdirSync(shadows, { recursive: true })
const shadowFile = path.join(shadows, path.basename(capture))
if (!fs.existsSync(shadowFile)) write(shadowFile, {
  date: snapshot.data_jogos, picks: reference.map(pick => archivePick(pick, 'referencia'))
})
if (picks.length) {
  archive.picks.push(...picks)
  write(history, archive)
}
write(path.join(outputDirectory, 'atual.json'), { ...archive, picks: archive.picks.filter(isRadarSignal), updatedAt: nowIso })
console.log(`${picks.length} novas indicações pré-jogo registradas.`)
