export interface Target { direction: string; threshold: number }

type PointKey = 'away_points' | 'home_points' | 'total_points'
interface GamePrediction {
  away_points: number
  home_points: number
  total_points: number
  home_margin: number
  favorite: string
  home_win_probability?: number
  pace?: number
  targets?: Partial<Record<PointKey, Target>>
}
interface GameIdentity { start_utc: string; home: string; away: string }
interface GameResult extends GameIdentity {
  status: string
  away_score?: number | null
  home_score?: number | null
  comparison?: {
    winner_correct?: boolean | null
    targets_correct?: Partial<Record<PointKey, boolean | null>>
  } | null
}
interface PlayerResult {
  id: string
  status: string
  actual?: number | null
  absolute_error?: number | null
  target_correct?: boolean | null
  context?: { actual_minutes?: number }
  analysis?: { fatores?: { texto: string }[] }
}
interface PlayerProjection {
  id: string
  player: string
  market: string
  classificacao: string
  jogo_utc: string
  team: string
  opponent: string
  projection: number
  season_mean?: number
  last5?: number
  sample?: number
  sigma?: number
  target?: Target
  summary?: string
  warnings?: string[]
  context?: { expected_minutes?: number }
}
interface ArchivedGame extends GameIdentity {
  prediction?: GamePrediction
  context?: { home_absences?: string[]; away_absences?: string[] }
}
export interface HistoryPlayer extends PlayerProjection { result?: PlayerResult }
export interface HistoryGame extends ArchivedGame {
  key: string
  date: string
  capturedAt: string
  modelHash: string
  result?: GameResult
  players: HistoryPlayer[]
}
interface Snapshot {
  date: string
  captured_at: string
  model_hash: string
  games: ArchivedGame[]
  recommendations?: PlayerProjection[]
}
interface Results { games?: GameResult[]; results?: PlayerResult[] }
interface HistoryIndex {
  days: { date: string; snapshot: string; results?: string }[]
  updated_at?: string
}
interface Totals {
  total?: number
  acertos?: number
  erros?: number
  taxa_acerto?: number | null
  erro_absoluto_medio?: number | null
}
interface Metrics {
  geral?: Totals
  destaques?: Totals
  mercados?: Record<string, Totals>
  contextos?: Record<string, Totals>
  jogos?: { total?: number; vencedor_acertado?: number; limites_atingidos?: number; limites_nao_atingidos?: number; mae_pontos_equipes?: number | null }
}
export interface HistoryArchive {
  days: string[]
  games: HistoryGame[]
  metrics?: Metrics
  warnings: string[]
  updatedAt?: string
}

async function readJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const base = new URL(import.meta.env.BASE_URL, window.location.origin)
  const url = new URL((import.meta.env.DEV ? '/' : '../') + path, base)
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]) })
  if (!response.ok) throw new Error('HTTP ' + response.status + ' · ' + path)
  return response.json()
}

const gameKey = (g: GameIdentity) => [g.start_utc, g.away, g.home].join('|')

export function mergeHistory(snapshot: Snapshot, results?: Results): HistoryGame[] {
  const gameResults = new Map((results?.games ?? []).map(game => [gameKey(game), game]))
  const playerResults = new Map((results?.results ?? []).map(player => [player.id, player]))
  return snapshot.games.map(game => ({
    ...game,
    key: snapshot.date + '|' + gameKey(game),
    date: snapshot.date,
    capturedAt: snapshot.captured_at,
    modelHash: snapshot.model_hash,
    result: gameResults.get(gameKey(game)),
    players: (snapshot.recommendations ?? []).filter(player =>
      player.jogo_utc === game.start_utc &&
      ((player.team === game.home && player.opponent === game.away) ||
        (player.team === game.away && player.opponent === game.home))
    ).map(player => ({ ...player, result: playerResults.get(player.id) }))
  }))
}

export async function loadHistory(signal: AbortSignal): Promise<HistoryArchive> {
  const index = await readJson<HistoryIndex>('historico/indice.json', signal)
  if (!Array.isArray(index.days)) throw new Error('Índice do histórico em formato inesperado.')
  const days = [...index.days].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 60)
  const warnings: string[] = []
  const metricsRequest = readJson<Metrics>('historico/metricas.json', signal).catch(() => undefined)
  const games: HistoryGame[] = []
  for (let offset = 0; offset < days.length; offset += 8) {
    signal.throwIfAborted()
    const batch = await Promise.all(days.slice(offset, offset + 8).map(async day => {
      const [snapshot, results] = await Promise.allSettled([
        readJson<Snapshot>(day.snapshot, signal),
        day.results ? readJson<Results>(day.results, signal) : Promise.resolve(undefined)
      ])
      if (snapshot.status === 'rejected' || !Array.isArray(snapshot.value?.games)) {
        return { games: [], warning: 'Projeções indisponíveis para ' + day.date }
      }
      return {
        games: mergeHistory(snapshot.value, results.status === 'fulfilled' ? results.value : undefined),
        warning: results.status === 'rejected' ? 'Resultados indisponíveis para ' + day.date : undefined
      }
    }))
    for (const day of batch) {
      games.push(...day.games)
      if (day.warning) warnings.push(day.warning)
    }
  }
  return { days: days.map(day => day.date), games, metrics: await metricsRequest, warnings, updatedAt: index.updated_at }
}
