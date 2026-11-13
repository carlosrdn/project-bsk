export interface Absence {
  posicao?: string
  nome: string
  situacao?: string
  jogos?: number
  minutos?: number
  pts?: number
  reb?: number
  ast?: number
}
export type RadarStat = 'pts' | 'reb' | 'ast' | 'tres'

export type PlayerStatCategory = RadarStat | 'blk' | 'stl'

export interface PlayerStat {
  media: number
  jogos: number
  ultimos5?: number | null
  desvio?: number | null
  minutos_media?: number | null
  minutos_ultimos5?: number | null
}

export interface Player {
  back_to_back?: boolean
  posicao?: string
  props?: Partial<Record<PlayerStatCategory, PlayerStat>>
  nome: string
  jogos: number
  minutos?: number
  pts?: number
  reb?: number
  ast?: number
  situacao?: string
}
export interface Team {
  back_to_back?: boolean
  sigla: string
  nome: string
  jogos: number
  vitorias: number
  derrotas: number
  ataque: number
  defesa: number
  ritmo: number
  vitorias_ultimos_10: number
  jogadores: Player[]
  ausencias: Absence[] | null
}
export interface Game {
  horario_utc: string
  casa: Team
  visitante: Team
}
export interface PlayerTuning {
  recent?: number
  fatigue?: number
}
export interface Calibration {
  version: string
  trainedThrough: string
  validatedThrough: string
  team?: { fatigue: number; sd: number }
  players: Partial<Record<PlayerStatCategory, PlayerTuning>>
  thresholds: Partial<Record<PlayerStatCategory, number[]>>
}
export interface CalibrationReport {
  games: number
  trainGames: number
  validationGames: number
  validationFrom: string | null
  validationThrough: string | null
  status: 'amostra_insuficiente' | 'promovido' | 'sem_ganho'
  promoted: string[]
}
export interface DataSnapshot {
  calibrationReport?: CalibrationReport
  calibration?: Calibration
  atualizado_em: string
  data_jogos: string
  lesoes_ok: boolean
  media_liga: { ataque: number; ritmo: number }
  jogos: Game[]
}
export interface ModelParams {
  wHome: number
  wForm: number
  K: number
  sd: number
  kInj: number
  fatigue?: number
}
export interface GamePrediction {
  home: number
  away: number
  total: number
  margin: number
  homeChance: number
  awayChance: number
  favorite: string
  injuryHome: number
  injuryAway: number
}
