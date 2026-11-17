import TeamTabs from './TeamTabs'
import { useEffect, useState } from 'react'
import { loadSchedule, type ScheduledMatch } from './lineup-espn'
import LiveScore from './LiveScore'
import { useLiveMatch } from './useLiveMatch'
import { radarLabels } from './radar-model'
import type { PlayerStatCategory } from './types'

const categories = Object.keys(radarLabels) as PlayerStatCategory[]

function ScheduleBoxScore({ day, game }: { day: string; game: ScheduledMatch }) {
  const { live, loading, refresh } = useLiveMatch(day, game.home, game.away)
  const [category, setCategory] = useState<PlayerStatCategory>('pts')
  const players = [...live?.players?.values() ?? []]
  return <>
    <LiveScore live={live} loading={loading} refresh={refresh}/>
    {players.length > 0 && <div className="match-players">
      <div className="player-categories" role="group" aria-label="Estatística dos jogadores">
        {categories.map(stat => <button type="button" className="refresh-btn" key={stat}
          aria-pressed={category === stat} onClick={() => setCategory(stat)}>{radarLabels[stat]}</button>)}
      </div>
      <TeamTabs away={{code: game.away, name: game.away}} home={{code: game.home, name: game.home}}>
        {team => {
          const rows = players.filter(player => player.team === team.code)
          return rows.length ? <dl className="schedule-boxscore">
            {rows.map(player => <div key={player.name}><dt>{player.name}</dt><dd>{player[category] ?? '—'}</dd></div>)}
          </dl> : <p className="detail-explain">Nenhuma estatística disponível para esta equipe.</p>
        }}
      </TeamTabs>
    </div>}
  </>
}

function ScheduleGame({ day, game }: { day: string; game: ScheduledMatch }) {
  const [open, setOpen] = useState(false)
  return <li>
    <details onToggle={event => setOpen(event.currentTarget.open)}>
      <summary>
        <strong>{game.away} {['Em andamento', 'Finalizado'].includes(game.status) && game.awayScore != null && game.homeScore != null
          ? game.awayScore + ' × ' + game.homeScore : '×'} {game.home}</strong>
        <span>{new Date(game.start).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })} BRT · {game.status}</span>
      </summary>
      {open && <ScheduleBoxScore day={day} game={game}/>}
    </details>
  </li>
}

export default function RoundSchedule({ day }: { day: string }) {
  const [games, setGames] = useState<ScheduledMatch[] | null>(null)
  const [error, setError] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setError(false)
    setGames(null)
    const refresh = () => loadSchedule(day, controller.signal).then(result => {
      if (!controller.signal.aborted) { setGames(result); setError(false) }
    }).catch(() => {
      if (!controller.signal.aborted) setError(true)
    })
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 30000)
    return () => { controller.abort(); window.clearInterval(timer) }
  }, [day, revision])

  return <section className="stat-tile schedule-list" aria-label="Agenda da ESPN">
    <h2>Agenda da ESPN</h2>
    {error && <div role="alert"><p>Não foi possível confirmar a agenda da rodada.</p>
      <button type="button" className="refresh-btn" onClick={() => setRevision(value => value + 1)}>Tentar novamente</button></div>}
    {!games ? !error && <p role="status">Consultando agenda…</p> :
      !games.length ? <p>Nenhuma partida na agenda desta rodada.</p> :
      <ul>{games.map(game => <ScheduleGame key={game.id} day={day} game={game}/>)}</ul>}
  </section>
}
