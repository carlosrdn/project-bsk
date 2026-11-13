import type { Game, GamePrediction, ModelParams, Team } from './types'

export const DEFAULT_PARAMS: ModelParams = {
  wHome: 2.5, wForm: 1.5, K: 12, sd: 12, kInj: 0.12
}
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1
  x = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * x)
  return sign * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x))
}
const cdf = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2))
const recentRate = (t: Team) => {
  const n = Math.min(t.jogos, 10)
  return n > 0 ? t.vitorias_ultimos_10 / n : 0.5
}
const shrink = (rating: number, games: number, league: number, k: number) =>
  k > 0 ? league + (rating - league) * games / (games + k) : rating
const WEIGHT: Record<string, number> = { 'Fora': 1, 'Provável ausência': 0.75, 'Dúvida': 0.25 }
const injuryImpact = (team: Team, k: number) => {
  if (k <= 0) return 0
  let total = 0
  for (const a of team.ausencias || []) {
    if (!a.jogos || (a.minutos ?? 0) < 15 || !team.jogos) continue
    const production = (a.pts ?? 0) + (a.reb ?? 0) + (a.ast ?? 0)
    total += (WEIGHT[a.situacao || ''] || 0) * Math.max(0, production - 15) *
      k * Math.min(1, a.jogos / team.jogos)
  }
  return Math.min(total, 8)
}

/** Porta explícita da função analisar() de bsk.js — teste de paridade no CI.
 * Não utilizar odds; nenhuma informação de resultados posteriores é usada.
 */
export function predictGame(game: Game, leagueAttack: number, params: ModelParams = DEFAULT_PARAMS): GamePrediction {
  const home = game.casa, away = game.visitante
  const pace = (home.ritmo + away.ritmo) / 2
  const ah = shrink(home.ataque, home.jogos, leagueAttack, params.K)
  const dh = shrink(home.defesa, home.jogos, leagueAttack, params.K)
  const aa = shrink(away.ataque, away.jogos, leagueAttack, params.K)
  const da = shrink(away.defesa, away.jogos, leagueAttack, params.K)
  let sh = (ah + da - leagueAttack) * pace / 100
  let sa = (aa + dh - leagueAttack) * pace / 100
  const ih = injuryImpact(home, params.kInj)
  const ia = injuryImpact(away, params.kInj)
  const adjustment = params.wHome + params.wForm * (recentRate(home) - recentRate(away)) + (ia - ih)
  sh += adjustment / 2
  sa -= adjustment / 2
  if (home.back_to_back) sh -= params.fatigue ?? 0
  if (away.back_to_back) sa -= params.fatigue ?? 0
  const margin = sh - sa
  const homeChance = cdf(margin / Math.max(params.sd, 1))
  return {
    home: sh, away: sa, total: sh + sa, margin,
    homeChance, awayChance: 1 - homeChance,
    favorite: homeChance >= 0.5 ? home.sigla : away.sigla,
    injuryHome: ih, injuryAway: ia
  }
}
