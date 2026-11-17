import type { Team } from './types'

export interface LineupPlayer {
  name: string
  position: string
  minutes: number
  status?: string
}

export const starter = 'Titular confirmado'
export const participated = 'Disponível confirmado'
const out = 'Fora'
const unavailable = [out, 'Improvável', 'Provável ausência']
const slots = ['PG', 'SG', 'SF', 'PF', 'C']
const positions: Record<string, string> = {
  'POINT GUARD': 'PG', 'SHOOTING GUARD': 'SG', 'SMALL FORWARD': 'SF',
  'POWER FORWARD': 'PF', CENTER: 'C', GUARD: 'G', FORWARD: 'F'
}

export function positionCode(value?: string | null) {
  const code = (value ?? '').toUpperCase().trim()
  return positions[code] || code
}

export function playerNameKey(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z ]/g, '').replace(/\b(jr|sr|ii|iii|iv)\b/g, '').replace(/\s+/g, ' ').trim()
}

function positionFit(a: string, b: string) {
  if (!a || !b) return 0
  if (a === b) return 2
  const pair = [a, b]
  return Number((pair.includes('G') && (pair.includes('PG') || pair.includes('SG'))) ||
    (pair.includes('F') && (pair.includes('SF') || pair.includes('PF'))))
}

export interface LineupHints {
  chart?: Record<string, string[]>
  recent?: LineupPlayer[]
}

export function buildLineup(team: Team, manual: Record<string, string>, box: LineupPlayer[], injuries: LineupPlayer[], hints: LineupHints = {}) {
  const chart = hints.chart ?? {}
  const recent = hints.recent ?? []
  const recentNames = new Set(recent.map(player => playerNameKey(player.name)))
  const officialInjuries = new Map(Object.entries(team.boletim_nba ?? {}).map(([name, status]) => [playerNameKey(name), status]))
  const chartPositions = new Map<string, string>()
  for (const slot of slots) {
    for (const name of chart[slot] ?? []) {
      const key = playerNameKey(name)
      if (!chartPositions.has(key)) chartPositions.set(key, slot)
    }
  }
  const injuryStatus = (key: string, live?: string) => live === out ? live : officialInjuries.get(key) ?? live
  const injuryByName = new Map(injuries.map(player => [playerNameKey(player.name), player]))
  const boxByName = new Map(box.map(player => [playerNameKey(player.name), player]))
  const roster = new Map<string, LineupPlayer>()
  const absences = new Map<string, LineupPlayer>()

  for (const absence of team.ausencias ?? []) {
    if (absence.situacao !== out) continue
    absences.set(playerNameKey(absence.nome), {
      name: absence.nome, position: positionCode(absence.posicao) || chartPositions.get(playerNameKey(absence.nome)) || '', minutes: absence.minutos || 0, status: out
    })
  }
  for (const injury of injuries) {
    if (injury.status === out) absences.set(playerNameKey(injury.name), injury)
  }
  for (const player of team.jogadores) {
    const name = playerNameKey(player.nome)
    const official = boxByName.get(name)
    const injury = injuryByName.get(name)
    const availability = injuryStatus(name, injury?.status)
    const status = manual[player.nome] || official?.status || availability || player.situacao
    if ((manual[player.nome] && status !== out) || status === starter || status === participated ||
      (['Disponível', 'Provável', 'Dúvida'].includes(availability ?? '') && !manual[player.nome])) absences.delete(name)
    roster.set(name, {
      name: official?.name || player.nome, position: official?.position || injury?.position || positionCode(player.posicao),
      minutes: player.minutos ?? official?.minutes ?? 0, status
    })
  }
  for (const player of box) {
    const name = playerNameKey(player.name)
    if (!roster.has(name)) roster.set(name, { ...player, status: player.status || injuryByName.get(name)?.status })
  }
  for (const slot of slots) {
    for (const name of chart[slot] ?? []) {
      const key = playerNameKey(name)
      if (!roster.has(key)) roster.set(key, { name, position: slot, minutes: 0, status: injuryStatus(key, injuryByName.get(key)?.status) })
    }
  }
  for (const player of recent) {
    const key = playerNameKey(player.name)
    if (!roster.has(key)) roster.set(key, { ...player, status: injuryStatus(key, injuryByName.get(key)?.status) })
  }
  for (const [name, player] of roster) {
    if (player.status === out) absences.set(name, { ...player, position: player.position || absences.get(name)?.position || '' })
    else if (player.status && [starter, participated].includes(player.status)) absences.delete(name)
  }

  const eligible = [...roster.values()].filter(player =>
    !absences.has(playerNameKey(player.name)) && !unavailable.includes(player.status || ''))
  const confirmed = eligible.filter(player => player.status === starter)
  const available = eligible.filter(player => player.status !== starter)
  const lineup = slots.map(position => ({ position, player: undefined as LineupPlayer | undefined }))
  const pending = [...confirmed]
  // Reserve exact positions before placing confirmed starters with broad or missing positions.
  for (const slot of lineup) {
    const index = pending.findIndex(player => player.position === slot.position)
    if (index >= 0) slot.player = pending.splice(index, 1)[0]
  }
  for (const player of pending.sort((a, b) => Number(!!b.position) - Number(!!a.position))) {
    const open = lineup.filter(slot => !slot.player)
    const target = open.find(slot => positionFit(slot.position, player.position)) || open[0]
    if (target) target.player = player
  }
  available.sort((a, b) => Number(recentNames.has(playerNameKey(b.name))) - Number(recentNames.has(playerNameKey(a.name))) || b.minutes - a.minutes)
  for (const slot of lineup) {
    if (slot.player) continue
    for (const name of chart[slot.position] ?? []) {
      const index = available.findIndex(player => playerNameKey(player.name) === playerNameKey(name))
      if (index < 0) continue
      slot.player = available.splice(index, 1)[0]
      break
    }
  }
  for (const fit of [2, 1, 0]) {
    for (const slot of lineup) {
      if (slot.player) continue
      const index = available.findIndex(player => positionFit(slot.position, player.position) >= fit)
      if (index >= 0) slot.player = available.splice(index, 1)[0]
    }
  }

  const replacements = [...absences.values()].map(absent => {
    const key = playerNameKey(absent.name)
    const position = chartPositions.get(key) || absent.position
    const wasStarter = recentNames.has(key) || Object.values(chart).some(names => names[0] && playerNameKey(names[0]) === key)
    const exact = lineup.find(slot => slot.position === position)?.player
    const compatible = lineup.flatMap(slot => slot.player && positionFit(position, slot.player.position) ? [slot.player] : [])
    const replacement = wasStarter || (!recent.length && !Object.keys(chart).length) ? exact ?? compatible[0] : undefined
    return { absent: { ...absent, position }, candidates: replacement ? [replacement] : [], byPosition: !!replacement }
  })
  return { lineup, confirmed: lineup.filter(slot => slot.player?.status === starter).length, replacements }
}
