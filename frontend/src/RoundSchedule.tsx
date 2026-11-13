import { useEffect, useState } from 'react'
import { loadSchedule, type ScheduledMatch } from './lineup-espn'

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
      <ul>{games.map(game => <li key={game.id}>
        <strong>{game.away} {['Em andamento', 'Finalizado'].includes(game.status) && game.awayScore != null && game.homeScore != null
          ? game.awayScore + ' × ' + game.homeScore : '×'} {game.home}</strong>
        <span>{new Date(game.start).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })} BRT · {game.status}</span>
      </li>)}</ul>}
  </section>
}
