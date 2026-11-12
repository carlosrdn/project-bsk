import type { DataSnapshot, Game, Team } from './types'

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x)
const numeric = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
function teamValid(x: unknown): x is Team {
  return isRecord(x) && typeof x.sigla === 'string' && typeof x.nome === 'string' &&
    numeric(x.jogos) && numeric(x.ataque) && numeric(x.defesa) && numeric(x.ritmo) &&
    numeric(x.vitorias_ultimos_10) && numeric(x.vitorias) && numeric(x.derrotas) &&
    Array.isArray(x.jogadores) && (x.ausencias === null || Array.isArray(x.ausencias))
}
function gameValid(x: unknown): x is Game {
  return isRecord(x) && typeof x.horario_utc === 'string' &&
    Number.isFinite(Date.parse(x.horario_utc)) && teamValid(x.casa) && teamValid(x.visitante)
}
export function validateSnapshot(x: unknown): DataSnapshot {
  if (!isRecord(x) || typeof x.data_jogos !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(x.data_jogos) ||
      typeof x.atualizado_em !== 'string' || typeof x.lesoes_ok !== 'boolean' ||
      !isRecord(x.media_liga) || !numeric(x.media_liga.ataque) ||
      !numeric(x.media_liga.ritmo) || !Array.isArray(x.jogos) || !x.jogos.every(gameValid)) {
    throw new Error('Formato do dados.js inválido ou incompleto. Nenhuma projeção será exibida.')
  }
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
