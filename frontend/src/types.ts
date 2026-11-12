export interface Absence {
  nome: string
  situacao?: string
  jogos?: number
  minutos?: number
  pts?: number
  reb?: number
  ast?: number
}
export interface Player {
  nome: string
  jogos: number
  minutos?: number
  pts?: number
  reb?: number
  ast?: number
  situacao?: string
}
export interface Team {
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
export interface DataSnapshot {
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
