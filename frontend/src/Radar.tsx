import { useEffect, useState } from 'react'
import { rankRadar, radarLabels } from './radar-model'
import type { RadarPick } from './radar-model'
import type { DataSnapshot, Game, GamePrediction } from './types'

const storageKey = 'bsk-escalações-v1'
const number = (value: number) => value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

function readStatuses(): Record<string, unknown> {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

function RadarCard({ pick }: { pick: RadarPick }) {
  const time = new Date(pick.game.horario_utc).toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo'
  })
  return <article className="stat-tile radar-card">
    <div className="stat-top"><span>{radarLabels[pick.stat]}</span><span>{pick.team.sigla} × {pick.opponent.sigla} · {time} BRT</span></div>
    <h3>{pick.player}</h3>
    <dl className="radar-values">
      <div><dt>Projeção</dt><dd>{number(pick.projected)}</dd></div>
      <div><dt>Média na temporada</dt><dd>{number(pick.sample.media)}</dd></div>
    </dl>
    <p>{pick.sample.jogos} jogos · Últimos 5: {pick.sample.ultimos5 == null ? '—' : number(pick.sample.ultimos5)} · Oscilação ±{number(pick.deviation)}</p>
    {pick.alerts.length > 0 && <ul>{pick.alerts.map(alert => <li key={alert}>{alert}</li>)}</ul>}
    <details>
      <summary>Como foi calculado</summary>
      <p>O modelo combina média da temporada, forma recente e contexto do confronto. Projeta {number(pick.teamPoints)} pontos para {pick.team.sigla}, com margem de {number(pick.margin)} pontos. A oscilação descreve a variação da projeção e ainda não foi calibrada pelo backtest.</p>
    </details>
  </article>
}

export default function Radar({ snapshot, current, matches }: {
  snapshot: DataSnapshot
  current: boolean
  matches: { game: Game; prediction: GamePrediction }[]
}) {
  const [manual, setManual] = useState(readStatuses)
  useEffect(() => {
    const update = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) setManual(readStatuses())
    }
    window.addEventListener('storage', update)
    return () => window.removeEventListener('storage', update)
  }, [])

  const ranked = rankRadar(matches, { date: snapshot.data_jogos, current, injuries: snapshot.lesoes_ok, manual })
  const selected = ranked.filter(pick => pick.eligible && pick.score > 0).slice(0, 6)
  const watching = ranked.filter(pick => !pick.eligible && pick.score > 0).slice(0, 5)
  const alerts = [...new Set(ranked.flatMap(pick => pick.alerts))].slice(0, 5)
  const cards = (picks: RadarPick[]) => <div className="radar-grid">{picks.map(pick =>
    <RadarCard key={JSON.stringify([pick.game.horario_utc, pick.team.sigla, pick.player])} pick={pick}/>
  )}</div>

  return <div className="radar">
    <section aria-labelledby="radar-selected">
      <div className="section-head"><h2 id="radar-selected">Projeções selecionadas</h2><span className="count-label">{selected.length}</span></div>
      {selected.length ? cards(selected) : <div className="empty-state">
        <strong>{ranked.length ? 'Nenhuma projeção passou pelos filtros' : 'Nenhum jogador com dados suficientes nesta coleta'}</strong>
        {ranked.length > 0 && <span>{alerts.length ? alerts.join(' · ') : 'Amostra curta ou variação histórica elevada.'}</span>}
      </div>}
    </section>
    {watching.length > 0 && <section aria-labelledby="radar-watching">
      <div className="section-head"><h2 id="radar-watching">Em observação</h2><span className="count-label">{watching.length}</span></div>
      {cards(watching)}
    </section>}
  </div>
}
