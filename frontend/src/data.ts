import type { DataSnapshot, Game, Team } from './types'

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x)
const numeric = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const count = (x: unknown): x is number => numeric(x) && Number.isInteger(x) && x >= 0
const positive = (x: unknown): x is number => numeric(x) && x > 0
const text = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0
const nonNegative = (x: unknown) => x == null || (numeric(x) && x >= 0)
const calendarDate = (x: unknown): x is string => {
  if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return false
  const value = Date.parse(x + 'T00:00:00Z')
  return Number.isFinite(value) && new Date(value).toISOString().slice(0, 10) === x
}
function athleteValid(x: unknown) {
  return isRecord(x) && text(x.nome) &&
    (x.posicao == null || typeof x.posicao === 'string') &&
    (x.situacao == null || typeof x.situacao === 'string') &&
    [x.minutos, x.pts, x.reb, x.ast].every(nonNegative)
}
function playerValid(x: unknown) {
  if (!isRecord(x) || !athleteValid(x) || !count(x.jogos)) return false
  if (x.props == null) return true
  return isRecord(x.props) && Object.values(x.props).every(stat =>
    isRecord(stat) && numeric(stat.media) && stat.media >= 0 && count(stat.jogos) &&
    [stat.ultimos5, stat.desvio, stat.minutos_media, stat.minutos_ultimos5].every(nonNegative))
}
function teamValid(x: unknown): x is Team {
  return isRecord(x) && text(x.sigla) && text(x.nome) &&
    count(x.jogos) && positive(x.ataque) && positive(x.defesa) && positive(x.ritmo) &&
    count(x.vitorias_ultimos_10) && count(x.vitorias) && count(x.derrotas) &&
    x.vitorias + x.derrotas === x.jogos && x.vitorias_ultimos_10 <= Math.min(x.vitorias, 10) &&
    Array.isArray(x.jogadores) && x.jogadores.every(playerValid) &&
    (x.ausencias === null || (Array.isArray(x.ausencias) && x.ausencias.every(absence =>
      isRecord(absence) && athleteValid(absence) && (absence.jogos == null || count(absence.jogos)))))
}
function gameValid(x: unknown): x is Game {
  return isRecord(x) && text(x.horario_utc) && Number.isFinite(Date.parse(x.horario_utc)) &&
    teamValid(x.casa) && teamValid(x.visitante) && x.casa.sigla !== x.visitante.sigla
}
export function validateSnapshot(x: unknown): DataSnapshot {
  if (!isRecord(x) || !calendarDate(x.data_jogos) ||
      !text(x.atualizado_em) || !Number.isFinite(Date.parse(x.atualizado_em)) ||
      typeof x.lesoes_ok !== 'boolean' || !isRecord(x.media_liga) || !positive(x.media_liga.ataque) ||
      !positive(x.media_liga.ritmo) || !Array.isArray(x.jogos) || !x.jogos.every(gameValid)) {
    throw new Error('Formato do dados.js inválido ou incompleto. Nenhuma projeção será exibida.')
  }
  const keys = x.jogos.map(game => [Date.parse(game.horario_utc), game.casa.sigla, game.visitante.sigla].join('|'))
  if (new Set(keys).size !== keys.length) throw new Error('dados.js contém confrontos duplicados.')
  return x as unknown as DataSnapshot
}
export function dataUrl(): string {
  if (import.meta.env.DEV) return '/dados.js'
  // GitHub Pages: /project-bsk/novo/ -> /project-bsk/dados.js
  return new URL('../dados.js', new URL(import.meta.env.BASE_URL, window.location.origin)).toString()
}
export async function loadSnapshot(): Promise<DataSnapshot> {
  const controller = new AbortController()
  const handle = window.setTimeout(() => controller.abort(), 12000)
  try {
    const response = await fetch(dataUrl(), { cache: 'no-store', signal: controller.signal })
    if (!response.ok) throw new Error('Não foi possível carregar dados.js (HTTP ' + response.status + ').')
    const raw = (await response.text()).trim()
    const match = raw.match(/^const\s+DADOS\s*=\s*([\s\S]*?);?\s*$/)
    if (!match) throw new Error('Dados recebidos em formato inesperado.')
    return validateSnapshot(JSON.parse(match[1].replace(/;\s*$/, '')))
  } finally {
    window.clearTimeout(handle)
  }
}
export function nbaToday(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date())
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]))
  return [p.year, p.month, p.day].join('-')
}
