import { useState } from 'react'
import { rankRadar, radarLabels } from './radar-model'
import { useManualStatuses } from './lineup-status'
import type { DataSnapshot, Game, GamePrediction, PlayerStatCategory } from './types'

const categories = Object.keys(radarLabels) as PlayerStatCategory[]
const number = (value?: number | null) => value == null ? '—' : value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })

export default function MatchPlayers({ match, snapshot }: {
  match: { game: Game; prediction: GamePrediction }
  snapshot: DataSnapshot
}) {
  const [category, setCategory] = useState<PlayerStatCategory>('pts')
  const { manual } = useManualStatuses()
  const started = Date.parse(match.game.horario_utc) <= Date.now()
  const players = rankRadar([match], {
    date: snapshot.data_jogos, current: true, injuries: snapshot.lesoes_ok, manual
  }, category).sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score)

  return <section className="match-players" aria-label="Projeções de jogadores">
    <h3>Projeções de jogadores</h3>
    <div className="player-categories" role="group" aria-label="Estatística dos jogadores">
      {categories.map(stat => <button type="button" className="refresh-btn" key={stat}
        aria-pressed={category === stat} onClick={() => setCategory(stat)}>{radarLabels[stat]}</button>)}
    </div>
    {started && <p className="detail-explain">O horário previsto de início já passou. Os valores abaixo são estimativas da coleta.</p>}
    {players.length ? <ul className="match-player-list">
      {players.slice(0, 18).map(pick => <li key={JSON.stringify([pick.team.sigla, pick.player])}>
        <div><strong>{pick.player}</strong><small>{pick.team.sigla} · {pick.sample.jogos} jogos</small></div>
        <dl>
          <div><dt>Projeção</dt><dd>{number(pick.projected)}</dd></div>
          <div><dt>Média</dt><dd>{number(pick.sample.media)}</dd></div>
          <div><dt>Últimos 5</dt><dd>{number(pick.sample.ultimos5)}</dd></div>
        </dl>
        <small className={pick.eligible ? 'player-eligible' : undefined}>
          {pick.eligible ? 'Histórico consistente' : pick.alerts.join(' · ') || 'Variação histórica elevada'}
        </small>
      </li>)}
    </ul> : <p className="detail-explain">Nenhum jogador disponível com pelo menos cinco jogos nesta estatística.</p>}
  </section>
}
