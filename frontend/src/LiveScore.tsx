import type { LiveMatch } from './useLiveMatch'

export default function LiveScore({ live, loading, refresh }: {
  live?: LiveMatch; loading: boolean; refresh: () => void
}) {
  const event = live?.event
  const showScore = event?.status === 'Em andamento' || event?.status === 'Finalizado'
  return <section className="match-live" aria-label="Acompanhamento da ESPN">
    <div className="match-live-heading">
      <h3>Acompanhamento ESPN</h3>
      <button type="button" className="refresh-btn" disabled={loading} onClick={refresh}>Atualizar ESPN</button>
    </div>
    <div role="status">
      {event && <p>
        <strong>{event.status === 'Em andamento' ? 'Ao vivo' : event.status}</strong>
        {showScore && event.awayScore != null && event.homeScore != null &&
          <> · {event.away} {event.awayScore} × {event.homeScore} {event.home}</>}
        {event.status === 'Em andamento' && event.detail && <> · {event.detail}</>}
      </p>}
      {live?.updatedAt != null && <p>Estatísticas atualizadas às {new Date(live.updatedAt).toLocaleTimeString('pt-BR')}</p>}
      {loading && !event && <p>Consultando ESPN…</p>}
      {live?.issue && <p>{live.issue}{live.players?.size ? ' Últimas estatísticas disponíveis exibidas.' : ''}</p>}
    </div>
  </section>
}
