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

export function buildLineup(team: Team, manual: Record<string, string>, box: LineupPlayer[], injuries: LineupPlayer[]) {
  const injuryByName = new Map(injuries.map(player => [playerNameKey(player.name), player]))
  const boxByName = new Map(box.map(player => [playerNameKey(player.name), player]))
  const roster = new Map<string, LineupPlayer>()
  const absences = new Map<string, LineupPlayer>()

  for (const absence of team.ausencias ?? []) {
    if (absence.situacao !== out) continue
    absences.set(playerNameKey(absence.nome), {
      name: absence.nome, position: positionCode(absence.posicao), minutes: absence.minutos || 0, status: out
    })
  }
  for (const injury of injuries) {
    if (injury.status === out) absences.set(playerNameKey(injury.name), injury)
  }
  for (const player of team.jogadores) {
    const name = playerNameKey(player.nome)
    const official = boxByName.get(name)
    const injury = injuryByName.get(name)
    const status = manual[player.nome] || official?.status || injury?.status || player.situacao
    if ((manual[player.nome] && status !== out) || status === starter || status === participated ||
      (injury?.status === 'Provável' && !manual[player.nome])) absences.delete(name)
    roster.set(name, {
      name: official?.name || player.nome, position: official?.position || injury?.position || positionCode(player.posicao),
      minutes: player.minutos ?? official?.minutes ?? 0, status
    })
  }
  for (const player of box) {
    const name = playerNameKey(player.name)
    if (!roster.has(name)) roster.set(name, { ...player, status: player.status || injuryByName.get(name)?.status })
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
  available.sort((a, b) => b.minutes - a.minutes)
  for (const fit of [2, 1, 0]) {
    for (const slot of lineup) {
      if (slot.player) continue
      const index = available.findIndex(player => positionFit(slot.position, player.position) >= fit)
      if (index >= 0) slot.player = available.splice(index, 1)[0]
    }
  }

  const replacements = [...absences.values()].map(absent => {
    const compatible = eligible.filter(player => positionFit(absent.position, player.position))
    const candidates = [...(compatible.length ? compatible : eligible)].sort((a, b) =>
      Number(b.status === starter) - Number(a.status === starter) || b.minutes - a.minutes
    ).slice(0, 3)
    return { absent, candidates, byPosition: compatible.length > 0 }
  })
  return { lineup, confirmed: lineup.filter(slot => slot.player?.status === starter).length, replacements }
}
