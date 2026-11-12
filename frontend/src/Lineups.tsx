import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { loadBoxScores, loadInjuries } from './lineup-espn'
import { buildLineup, starter, type LineupPlayer } from './lineup-model'
import { automatic, playerKey, statusOptions, useManualStatuses } from './lineup-status'
import type { DataSnapshot } from './types'

const emptyFeed = new Map<string, LineupPlayer[]>()

export default function Lineups({ snapshot, current }: { snapshot: DataSnapshot; current: boolean }) {
  const { manual, save, error } = useManualStatuses()
  const [selected, setSelected] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [loading, setLoading] = useState(false)
  const [box, setBox] = useState(emptyFeed)
  const [injuries, setInjuries] = useState(emptyFeed)
  const [messages, setMessages] = useState<string[]>([])

  useEffect(() => {
    if (!snapshot.jogos.length) return
    const controller = new AbortController()
    const teams = new Set(snapshot.jogos.flatMap(game => [game.casa.sigla, game.visitante.sigla]))
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
  const keys = teams.flatMap(team => team.jogadores.map(player => playerKey(snapshot.data_jogos, team.sigla, player.nome)))
  const corrections = keys.filter(key => manual[key]).length
  return <section className="lineups" aria-label="Escalações">
    <div className="lineup-toolbar">
      <label>Confronto
        <select value={match.key} onChange={event => setSelected(event.target.value)}>
          {games.map(({ game, key }) => <option key={key} value={key}>{game.visitante.sigla} × {game.casa.sigla}</option>)}
        </select>
      </label>
      <button type="button" className="refresh-btn" disabled={loading} onClick={() => setRefresh(value => value + 1)}>
        <RefreshCw size={16} className={loading ? 'spin' : ''}/> Atualizar ESPN
      </button>
      <button type="button" className="refresh-btn" disabled={!corrections} onClick={() => save(latest => keys.forEach(key => delete latest[key]))}>
        Limpar correções do confronto
      </button>
    </div>
    <div className="lineup-feed" role="status">
      {loading ? 'Consultando ESPN…' : messages.join(' ')}
      {error && <p>{error}</p>}
    </div>
    <div className="lineup-grid">
      {teams.map(team => {
        const teamBox = box.get(team.sigla) ?? []
        const overrides = Object.fromEntries(team.jogadores.map(player => [player.nome, manual[playerKey(snapshot.data_jogos, team.sigla, player.nome)]]))
        const { lineup, confirmed, replacements } = buildLineup(team, overrides, teamBox, injuries.get(team.sigla) ?? [])
        return <article className="stat-tile lineup-team" key={team.sigla}>
          <header className="lineup-team-header"><h2>{team.nome}</h2>
          <p>{confirmed === 5 ? 'Quinteto confirmado' : confirmed + ' de 5 titulares confirmados · vagas restantes projetadas'}</p></header>
          <ul className="lineup-list">
            {lineup.map(({ position, player }) => <li key={position}>
              <span className="lineup-position">{position}</span>
              <strong>{player?.name || 'A definir'}</strong>
              <span className={'lineup-state' + (player?.status === starter ? ' lineup-state-confirmed' : '')}>{player?.status === starter ? 'Confirmado' : player ? 'Projetado' : 'Pendente'}</span>
            </li>)}
          </ul>
          {replacements.length > 0 && <details>
            <summary>Desfalques e possíveis substitutos ({replacements.length})</summary>
            {replacements.map(({ absent, candidates, byPosition }) => <div className="lineup-replacement" key={absent.name}>
              <strong>{absent.name} · Fora{absent.position && ' · ' + absent.position}</strong>
              <p>{candidates.length ? byPosition ? 'Candidatos por posição e minutagem' : 'Alternativas pela rotação' : 'Sem substituto identificado'}</p>
              <ul>{candidates.map(player => <li key={player.name}>{player.name} · {player.minutes.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} min{player.status === starter && ' · titular confirmado'}</li>)}</ul>
            </div>)}
          </details>}
          {teamBox.length > 0 && <details>
            <summary>Elenco no box score da ESPN ({teamBox.length})</summary>
            <ul>{teamBox.map(player => <li key={player.name}>{player.name} · {player.status || 'Participação pendente'}</li>)}</ul>
          </details>}
          <details>
            <summary>Corrigir disponibilidade manualmente</summary>
            {team.jogadores.map(player => {
              const key = playerKey(snapshot.data_jogos, team.sigla, player.nome)
              return <label className="lineup-correction" key={key}>{player.nome}
                <select value={manual[key] || automatic} onChange={event => {
                  const status = event.target.value
                  save(latest => {
                    if (status === automatic) delete latest[key]
                    else latest[key] = status
                  })
                }}>
                  {statusOptions.map(status => <option key={status} value={status}>{status === automatic ? 'Automático' : status}</option>)}
                </select>
              </label>
            })}
            {!team.jogadores.length && <p>Sem jogadores na coleta.</p>}
          </details>
        </article>
      })}
    </div>
  </section>
}
