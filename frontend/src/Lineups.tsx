import BackToBack from './BackToBack'
import { playerNameKey } from './lineup-model'
import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { loadBoxScores, loadInjuries, loadLineupHints } from './lineup-espn'
import { buildLineup, starter, type LineupPlayer, type LineupHints } from './lineup-model'
import type { DataSnapshot } from './types'

const emptyFeed = new Map<string, LineupPlayer[]>()

export default function Lineups({ snapshot, current }: { snapshot: DataSnapshot; current: boolean }) {
  const [selected, setSelected] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [loading, setLoading] = useState(false)
  const [box, setBox] = useState(emptyFeed)
  const [injuries, setInjuries] = useState(emptyFeed)
  const [hints, setHints] = useState(new Map<string, LineupHints>())
  const [messages, setMessages] = useState<string[]>([])

  useEffect(() => {
    if (!snapshot.jogos.length) return
    const controller = new AbortController()
    const roster = snapshot.jogos.flatMap(game => [game.casa, game.visitante])
    const teams = new Set(roster.map(team => team.sigla))
    void loadLineupHints(roster, controller.signal).then(result => {
      if (!controller.signal.aborted) setHints(result)
    })
    async function update() {
      setLoading(true)
      const [scores, reports] = await Promise.allSettled([
        loadBoxScores(snapshot.data_jogos, teams, controller.signal),
        current ? loadInjuries(controller.signal) : Promise.resolve(emptyFeed)
      ])
      if (controller.signal.aborted) return
      const notices: string[] = []
      if (scores.status === 'fulfilled') {
        const result = scores.value
        setBox(previous => result.partial ? new Map([...previous, ...result.box]) : result.box)
        if (scores.value.partial) notices.push('Alguns box scores da ESPN estão indisponíveis.')
        if (!scores.value.box.size) notices.push('A ESPN ainda não retornou escalações para esta rodada.')
      } else notices.push('Box scores da ESPN indisponíveis.')
      if (reports.status === 'fulfilled') setInjuries(reports.value)
      else notices.push('Boletim de lesões da ESPN indisponível.')
      setMessages(notices)
      setLoading(false)
    }
    void update()
    const interval = window.setInterval(() => { void update() }, 60000)
    return () => {
      controller.abort()
      window.clearInterval(interval)
    }
  }, [snapshot, current, refresh])

  const games = snapshot.jogos.map(game => ({ game, key: [game.horario_utc, game.visitante.sigla, game.casa.sigla].join('|') }))
    .sort((a, b) => a.game.horario_utc.localeCompare(b.game.horario_utc))
  const match = games.find(game => game.key === selected) || games[0]
  if (!match) return <div className="empty-state"><strong>Nenhum confronto nesta coleta</strong></div>

  const teams = [match.game.visitante, match.game.casa]
  return <section className="lineups" aria-label="Escalações">
    <div className="lineup-fixtures">
      <h2>Confronto</h2>
      <div className="lineup-fixture-list" role="group" aria-label="Escolher confronto">
        {games.map(({ game, key }) => <button type="button" className="lineup-fixture" key={key}
          aria-pressed={key === match.key} onClick={() => setSelected(key)}>
          {game.visitante.sigla} <span>×</span> {game.casa.sigla}
        </button>)}
      </div>
    </div>
    <div className="lineup-toolbar">
      <button type="button" className="refresh-btn" disabled={loading} onClick={() => setRefresh(value => value + 1)}>
        <RefreshCw size={16} className={loading ? 'spin' : ''}/> Atualizar ESPN
      </button>
    </div>
    <div className="lineup-feed" role="status">
      {loading ? 'Consultando ESPN…' : messages.join(' ')}
    </div>
    <div className="lineup-grid">
      {teams.map(team => {
        const teamBox = box.get(team.sigla) ?? []
        const { lineup, confirmed, replacements } = buildLineup(team, {}, teamBox, injuries.get(team.sigla) ?? [], hints.get(team.sigla))
        return <article className="stat-tile lineup-team" key={team.sigla}>
          <header className="lineup-team-header"><BackToBack active={team.back_to_back}/><h2>{team.nome}</h2>
          {Object.keys(team.boletim_nba ?? {}).length > 0 && <p>Desfalques cruzados com o boletim oficial da NBA</p>}
          <p>{confirmed === 5 ? 'Quinteto confirmado' : confirmed + ' de 5 titulares confirmados · vagas restantes projetadas'}</p></header>
          <ul className="lineup-list">
            {lineup.map(({ position, player }) => <li key={position}>
              <span className="lineup-position">{position}</span>
              <strong><BackToBack active={!!player && team.jogadores.some(entry => entry.back_to_back && playerNameKey(entry.nome) === playerNameKey(player.name))} player/>{player?.name || 'A definir'}</strong>
              <span className={'lineup-state' + (player?.status === starter ? ' lineup-state-confirmed' : '')}>{player?.status === starter ? 'Confirmado' : player ? 'Projetado' : 'Pendente'}</span>
            </li>)}
          </ul>
          {replacements.length > 0 && <details>
            <summary>Desfalques e possíveis substitutos ({replacements.length})</summary>
            {replacements.map(({ absent, candidates }) => <div className="lineup-replacement" key={absent.name}>
              <strong>{absent.name} · Fora{absent.position && ' · ' + absent.position}</strong>
              {candidates[0] && <p>Substituto provável <b>{candidates[0].name}</b></p>}
            </div>)}
          </details>}
          {teamBox.length > 0 && <details>
            <summary>Elenco no box score da ESPN ({teamBox.length})</summary>
            <ul>{teamBox.map(player => <li key={player.name}>{player.name} · {player.status || 'Participação pendente'}</li>)}</ul>
          </details>}
        </article>
      })}
    </div>
  </section>
}
