import { rankRadar, thresholdChance } from './radar-model'
import type { RadarPick } from './radar-model'
import type { DataSnapshot, Game, GamePrediction } from './types'

const categories = ['pts', 'reb', 'ast', 'tres'] as const
type Category = typeof categories[number]
type Line = { home: string; away: string; team: string; start: string; player: string; stat: Category; line: number }
export type Feed = { collectedAt: string; lines: Line[] }
export type Recommendation = RadarPick & { line: number; side: 'Acima' | 'Abaixo'; probability: number }

const nameKey = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
const aliases: Record<string, string> = { GS: 'GSW', NO: 'NOP', NY: 'NYK', SA: 'SAS', WSH: 'WAS', UTAH: 'UTA' }
const teamKey = (name: string) => aliases[name.toUpperCase()] ?? name.toUpperCase()

export function selectRecommendations(matches: { game: Game; prediction: GamePrediction }[],
  snapshot: DataSnapshot, feed: Feed, clock: number): Recommendation[] {
  const age = clock - Date.parse(feed.collectedAt)
  if (age < 0 || age > 12 * 3600_000 || Date.parse(snapshot.atualizado_em) > clock ||
      clock - Date.parse(snapshot.atualizado_em) > 12 * 3600_000) return []
  const pending = matches.filter(({ game }) => Date.parse(game.horario_utc) > clock)
  const candidates = categories.flatMap(stat => {
    const residuals = snapshot.calibration?.thresholds[stat]
    if (!residuals) return []
    return rankRadar(pending, { date: snapshot.data_jogos, current: true,
      injuries: snapshot.lesoes_ok, manual: {}, calibration: snapshot.calibration }, stat).flatMap(pick => {
      if (!pick.eligible) return []
      const lines = feed.lines.filter(line => line.stat === stat && teamKey(line.team) === pick.team.sigla &&
        teamKey(line.home) === pick.game.casa.sigla && teamKey(line.away) === pick.game.visitante.sigla &&
        Math.abs(Date.parse(line.start) - Date.parse(pick.game.horario_utc)) <= 15 * 60_000 &&
        Date.parse(line.start) > clock && nameKey(line.player) === nameKey(pick.player))
      if (lines.length !== 1) return []
      const { line } = lines[0]
      const above = thresholdChance(pick.projected, pick.deviation, line, residuals)
      const probability = Math.max(above, 1 - above)
      const side: Recommendation['side'] = above >= .5 ? 'Acima' : 'Abaixo'
      return probability >= .55 ? [{ ...pick, line, side, probability }] : []
    })
  }).sort((a, b) => b.probability - a.probability || b.score - a.score)
  const players = new Set<string>()
  return candidates.filter(pick => {
    const key = JSON.stringify([pick.game.horario_utc, pick.team.sigla, pick.player])
    if (players.has(key)) return false
    players.add(key)
    return true
  }).slice(0, 6)
}
