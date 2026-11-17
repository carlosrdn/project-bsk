import { participated, playerNameKey, positionCode, starter } from './lineup-model'
import type { PlayerStatCategory, Team } from './types'
import type { LineupPlayer } from './lineup-model'

const api = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/'
const codes: Record<string, string> = { GS: 'GSW', NO: 'NOP', NY: 'NYK', SA: 'SAS', WSH: 'WAS', UTAH: 'UTA' }
const teamCode = (code = '') => codes[code.toUpperCase()] || code.toUpperCase()
type TeamRef = { abbreviation?: string }
type Athlete = {
  displayName?: string
  fullName?: string
  position?: { abbreviation?: string; name?: string }
  team?: TeamRef
}
type Group = {
  name?: string; displayName?: string; type?: string
  names?: string[]; labels?: string[]
  athletes?: { athlete?: Athlete; displayName?: string; starter?: boolean | number | string; stats?: string[]; didNotPlay?: boolean }[]
}
type Summary = { boxscore?: { players?: { team?: TeamRef; statistics?: Group[] }[] } }
type Scoreboard = { events?: {
  id?: string; date?: string; status?: { type?: { state?: string; name?: string; shortDetail?: string } }
  competitions?: { competitors?: { team?: TeamRef; homeAway?: string; score?: string }[] }[]
}[] }

export interface ScheduledMatch { id: string; start: string; home: string; away: string; status: string; state?: string; detail?: string; homeScore?: string; awayScore?: string }
type InjuryReport = { injuries?: { team?: TeamRef; injuries?: { athlete?: Athlete; status?: string; shortComment?: string }[] }[] }

async function request<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(api + path, { cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]) })
  if (!response.ok) throw new Error('ESPN HTTP ' + response.status)
  return response.json()
}

export function parseBox(groups: Group[] = []): LineupPlayer[] {
  const roster = new Map<string, LineupPlayer>()
  for (const group of groups) {
    const minutesIndex = (group.names || group.labels || []).findIndex(name => name.toUpperCase() === 'MIN')
    const startersGroup = /^(starters?|titulares?)$/i.test((group.name || group.displayName || group.type || '').trim())
    for (const item of group.athletes ?? []) {
      const name = item.athlete?.displayName || item.athlete?.fullName || item.displayName || ''
      const key = playerNameKey(name)
      if (!key) continue
      const [min, sec = '0'] = String(item.stats?.[minutesIndex] ?? '').split(':')
      const total = Number(min) + Number(sec) / 60
      const minutes = Number.isFinite(total) ? total : 0
      const confirmed = [true, 1, 'true', '1'].includes(item.starter ?? false) || startersGroup
      const previous = roster.get(key)
      const status = item.didNotPlay ? undefined : confirmed ? starter : minutes > 0 ? participated : undefined
      roster.set(key, { name, status: previous?.status === starter ? starter : status || previous?.status,
        position: positionCode(item.athlete?.position?.abbreviation || item.athlete?.position?.name) || previous?.position || '',
        minutes: Math.max(minutes, previous?.minutes ?? 0) })
    }
  }
  return [...roster.values()]
}

async function scoreboard(date: string, signal: AbortSignal) {
  const board = await request<Scoreboard>('scoreboard?dates=' + date.replaceAll('-', ''), signal)
  if (!Array.isArray(board.events)) throw new Error('Rodada ESPN inválida')
  return board.events
}

export async function loadSchedule(date: string, signal: AbortSignal): Promise<ScheduledMatch[]> {
  const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
  const events = await scoreboard(date, signal)
  return events.map(event => {
    const sides = event.competitions?.[0]?.competitors ?? []
    const home = teamCode(sides.find(side => side.homeAway === 'home')?.team?.abbreviation)
    const away = teamCode(sides.find(side => side.homeAway === 'away')?.team?.abbreviation)
    if (!event.id || !event.date || !Number.isFinite(Date.parse(event.date)) || !home || !away) {
      throw new Error('Partida ESPN em formato inesperado')
    }
    const state = event.status?.type?.state
    const name = event.status?.type?.name
    const status = name === 'STATUS_POSTPONED' ? 'Adiado' : name === 'STATUS_CANCELED' ? 'Cancelado' :
      state === 'in' ? 'Em andamento' : state === 'post' ? 'Finalizado' : state === 'pre' ? 'Pré-jogo' : 'Status indisponível'
    return {
      id: event.id, start: event.date, home, away, status, state, detail: event.status?.type?.shortDetail,
      homeScore: sides.find(side => side.homeAway === 'home')?.score,
      awayScore: sides.find(side => side.homeAway === 'away')?.score
    }
  }).filter(game => {
    const parts = Object.fromEntries(dayFormat.formatToParts(new Date(game.start)).map(part => [part.type, part.value]))
    return [parts.year, parts.month, parts.day].join('-') === date
  }).sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
}

const statColumns: Record<PlayerStatCategory, string[]> = {
  pts: ['PTS', 'POINTS'], reb: ['REB', 'REBOUNDS'], ast: ['AST', 'ASSISTS'],
  tres: ['3PT', '3PM', 'FG3M'], blk: ['BLK', 'BLOCKS'], stl: ['STL', 'STEALS']
}

export type LivePlayerStats = { name: string; team: string } & Partial<Record<PlayerStatCategory, number>>
export const livePlayerKey = (team: string, name: string) => team + '|' + playerNameKey(name)

export async function loadLiveStats(id: string, signal: AbortSignal) {
  const summary = await request<Summary>('summary?event=' + encodeURIComponent(id), signal)
  const players = new Map<string, LivePlayerStats>()
  for (const team of summary.boxscore?.players ?? []) {
    const code = teamCode(team.team?.abbreviation)
    for (const group of team.statistics ?? []) {
      const labels = (group.names || group.labels || []).map(label => label.toUpperCase().replace(/[^A-Z0-9]/g, ''))
      for (const item of group.athletes ?? []) {
        const name = item.athlete?.displayName || item.athlete?.fullName || item.displayName
        if (!code || !name || item.didNotPlay || !item.stats) continue
        const key = livePlayerKey(code, name)
        const stats = players.get(key) ?? { name, team: code }
        let hasStats = players.has(key)
        for (const category of Object.keys(statColumns) as PlayerStatCategory[]) {
          const index = labels.findIndex(label => statColumns[category].includes(label))
          const raw = String(item.stats[index] ?? '').trim()
          const made = category === 'tres' ? raw.match(/^(\d+)-\d+$/)?.[1] ?? raw : raw
          if (/^\d+$/.test(made)) {
            stats[category] = Number(made)
            hasStats = true
          }
        }
        if (hasStats) players.set(key, stats)
      }
    }
  }
  return players
}

export async function loadBoxScores(date: string, teams: Set<string>, signal: AbortSignal) {
  const events = (await scoreboard(date, signal)).filter(event => event.id &&
    event.competitions?.[0]?.competitors?.some(entry => teams.has(teamCode(entry.team?.abbreviation))))
  const results = await Promise.allSettled(events.map(event => request<Summary>('summary?event=' + encodeURIComponent(event.id!), signal)))
  const box = new Map<string, LineupPlayer[]>()
  for (const result of results) {
    if (result.status === 'rejected') continue
    for (const team of result.value.boxscore?.players ?? []) {
      const code = teamCode(team.team?.abbreviation)
      if (teams.has(code)) box.set(code, parseBox(team.statistics))
    }
  }
  return { box, partial: results.some(result => result.status === 'rejected') }
}

type DepthResponse = { depthchart?: { positions?: Record<string, { athletes?: Athlete[] }> }[] }

export async function loadLineupHints(teams: Team[], signal: AbortSignal) {
  const recent = new Map([...new Set(teams.flatMap(team => team.ultimo_jogo_espn ? [team.ultimo_jogo_espn] : []))]
    .map(id => [id, request<Summary>('summary?event=' + encodeURIComponent(id), signal).catch(() => undefined)]))
  return new Map(await Promise.all(teams.map(async team => {
    const [depth, prior] = await Promise.all([
      team.espn_id ? request<DepthResponse>('teams/' + encodeURIComponent(team.espn_id) + '/depthcharts', signal)
        .catch(() => undefined) : undefined,
      team.ultimo_jogo_espn ? recent.get(team.ultimo_jogo_espn) : undefined
    ])
    const chart = Object.fromEntries(Object.entries(depth?.depthchart?.[0]?.positions ?? {}).map(([position, entry]) =>
      [positionCode(position), (entry.athletes ?? []).flatMap(player => player.displayName ? [player.displayName] : [])]))
    const previous = prior?.boxscore?.players?.find(group => teamCode(group.team?.abbreviation) === team.sigla)
    const recentStarters = parseBox(previous?.statistics).filter(player => player.status === starter)
    return [team.sigla, { chart, recent: recentStarters }] as const
  })))
}

export async function loadInjuries(signal: AbortSignal) {
  const report = await request<InjuryReport>('injuries', signal)
  if (!Array.isArray(report.injuries)) throw new Error('Boletim ESPN inválido')
  const injuries = new Map<string, LineupPlayer[]>()
  for (const group of report.injuries) {
    for (const item of group.injuries ?? []) {
      const name = item.athlete?.displayName
      const team = teamCode(item.athlete?.team?.abbreviation || group.team?.abbreviation)
      if (!name || !team) continue
      const comment = item.shortComment?.toLowerCase() || ''
      const code = item.status?.toLowerCase()
      const status = code === 'out' || /ruled out|listed as out|downgraded to out|will not play|won't play|is out/.test(comment)
        ? 'Fora' : code === 'doubtful' || /doubtful/.test(comment)
          ? 'Provável ausência' : code === 'probable' || /probable/.test(comment) ? 'Provável' : 'Dúvida'
      const roster = injuries.get(team) ?? []
      roster.push({ name, position: positionCode(item.athlete?.position?.abbreviation || item.athlete?.position?.name), minutes: 0, status })
      injuries.set(team, roster)
    }
  }
  return injuries
}
