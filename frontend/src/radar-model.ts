import type { Game, GamePrediction, PlayerStat, RadarStat, Team } from './types'

export const radarLabels = {
  pts: 'Pontos', reb: 'Rebotes', ast: 'Assistências', tres: 'Bolas de 3'
}

const minimum: Record<RadarStat, number> = { pts: 8, reb: 3.5, ast: 2.5, tres: 1.5 }
const stats = ['pts', 'reb', 'ast', 'tres'] as const
const manualStatuses = ['Titular confirmado', 'Disponível confirmado', 'Provável', 'Questionável', 'Improvável', 'Fora']
const available = ['Sem confirmação de titularidade', 'Disponível', 'Titular confirmado', 'Disponível confirmado', 'Banco confirmado']
const unavailable = ['Fora', 'Improvável', 'Provável ausência']
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

export interface RadarPick {
  game: Game
  player: string
  team: Team
  opponent: Team
  stat: RadarStat
  sample: PlayerStat
  projected: number
  deviation: number
  score: number
  eligible: boolean
  alerts: string[]
  teamPoints: number
  margin: number
}

export function projectPlayer(stat: RadarStat, sample: PlayerStat, team: Team, opponent: Team, points: number, margin: number) {
  const recent = finite(sample.ultimos5) ? sample.ultimos5 : sample.media
  const weight = sample.jogos < 6 ? 0 : sample.jogos < 10 ? 0.18 : 0.30
  const base = sample.media * (1 - weight) + recent * weight
  const expected = team.ataque * team.ritmo / 100
  const relative = expected > 0 ? points / expected : 1
  const pace = team.ritmo > 0 ? ((team.ritmo + opponent.ritmo) / 2) / team.ritmo : 1
  const exposure = {
    pts: clamp(relative, 0.90, 1.10),
    ast: clamp(Math.pow(relative, 0.6), 0.94, 1.06),
    tres: clamp(Math.pow(relative, 0.45), 0.95, 1.05),
    reb: clamp(pace, 0.94, 1.06)
  }[stat]
  const usualMinutes = sample.minutos_media
  const recentMinutes = sample.minutos_ultimos5
  const rotation = sample.jogos >= 8 && finite(usualMinutes) && usualMinutes > 0 && finite(recentMinutes) && recentMinutes > 0
    ? clamp(Math.pow(recentMinutes / usualMinutes, 0.5), 0.92, 1.08) : 1
  const blowout = margin > 0 ? 1 - Math.min(0.045, Math.max(0, margin - 12) * 0.003) : 1
  const prior = {
    pts: 0.3 * base + 1.2, reb: 0.36 * base + 0.5,
    ast: 0.45 * base + 0.5, tres: Math.sqrt(Math.max(base, 0)) + 0.2
  }[stat]
  const observed = finite(sample.desvio) ? sample.desvio : prior
  return {
    projected: Math.max(0, base * exposure * (blowout * rotation)),
    deviation: Math.max(stat === 'pts' ? 2 : 0.65, (sample.jogos * observed + 8 * prior) / (sample.jogos + 8))
  }
}

export function rankRadar(
  matches: { game: Game; prediction: GamePrediction }[],
  context: { date: string; current: boolean; injuries: boolean; manual: Record<string, unknown> }
) {
  const candidates: RadarPick[] = []
  for (const { game, prediction } of matches) {
    for (const home of [true, false]) {
      const team = home ? game.casa : game.visitante
      const opponent = home ? game.visitante : game.casa
      const teamPoints = home ? prediction.home : prediction.away
      const margin = home ? prediction.margin : -prediction.margin
      for (const player of team.jogadores) {
        const manual = context.manual[[context.date, team.sigla, player.nome].join('|')]
        const status = typeof manual === 'string' && manualStatuses.includes(manual)
          ? manual : player.situacao === 'Disponível' ? 'Sem confirmação de titularidade' : player.situacao || 'Desconhecido'
        if (unavailable.includes(status)) continue
        let best: RadarPick | undefined
        for (const stat of stats) {
          const sample = player.props?.[stat]
          if (!sample || !finite(sample.jogos) || sample.jogos < 5 || !finite(sample.media) || sample.media < minimum[stat]) continue
          const { projected, deviation } = projectPlayer(stat, sample, team, opponent, teamPoints, margin)
          const alerts: string[] = []
          if (!context.current) alerts.push('Coleta de outra rodada ou data não verificável')
          if (!available.includes(status)) alerts.push('Situação do jogador: ' + status)
          if (sample.jogos < 8) alerts.push('Amostra pequena (' + sample.jogos + ' jogos)')
          if (sample.jogos >= 8 && sample.jogos < 12) alerts.push('Histórico ainda curto')
          if (team.ausencias == null || opponent.ausencias == null) alerts.push('Desfalques não verificados')
          if (!context.injuries) alerts.push('Atualização de lesões indisponível')
          if (margin >= 12) alerts.push('Possível redução de minutos')
          const variation = deviation / Math.max(sample.media, 1)
          const score = Math.min(1, sample.jogos / 18) / (1 + variation) - Math.min(0.8, alerts.length * 0.17)
          const eligible = alerts.length === 0 && sample.jogos >= 12 && variation <= (stat === 'tres' ? 0.95 : 0.75)
          if (!best || (eligible === best.eligible ? score > best.score : eligible)) {
            best = { game, player: player.nome, team, opponent, stat, sample, projected, deviation, score, eligible, alerts, teamPoints, margin }
          }
        }
        if (best) candidates.push(best)
      }
    }
  }
  return candidates.sort((a, b) => b.score - a.score)
}
