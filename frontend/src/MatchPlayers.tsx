import BackToBack from './BackToBack'
import { useState } from 'react'
import { livePlayerKey } from './lineup-espn'
import type { LiveMatch } from './useLiveMatch'
import { rankRadar, radarLabels } from './radar-model'
import { MarketPickCards } from './Radar'
import type { MarketPick } from './useMarketPicks'
import { useManualStatuses } from './lineup-status'
import type { DataSnapshot, Game, GamePrediction, PlayerStatCategory } from './types'

const categories = Object.keys(radarLabels) as PlayerStatCategory[]
const number = (value?: number | null) => value == null ? '—' : value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })

export default function MatchPlayers({ match, snapshot, live, picks }: {
  match: { game: Game; prediction: GamePrediction }
  snapshot: DataSnapshot
  live?: LiveMatch
  picks: MarketPick[]
}) {
  const [category, setCategory] = useState<PlayerStatCategory>('pts')
  const { manual } = useManualStatuses()
  const started = Date.parse(match.game.horario_utc) <= Date.now()
  const showActual = live?.event?.status === 'Em andamento' || live?.event?.status === 'Finalizado'
  const players = rankRadar([match], {
    date: snapshot.data_jogos, current: true, injuries: snapshot.lesoes_ok, manual, calibration: snapshot.calibration
  }, category).sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score)

  return <section className="match-players" aria-label="Projeções de jogadores">
    {!started && <>
      <h3>Indicações pré-jogo</h3>
      {picks.length ? <MarketPickCards picks={picks}/> : <p className="detail-explain">Sem entrada disponível para este jogo.</p>}
    </>}
    <h3>Estatísticas e projeções de jogadores</h3>
    <div className="player-categories" role="group" aria-label="Estatística dos jogadores">
      {categories.map(stat => <button type="button" className="refresh-btn" key={stat}
        aria-pressed={category === stat} onClick={() => setCategory(stat)}>{radarLabels[stat]}</button>)}
    </div>
    {started && <p className="detail-explain">O horário previsto de início já passou. Os valores abaixo são estimativas da coleta.</p>}
    {players.length ? <ul className="match-player-list">
      {players.slice(0, 18).map(pick => <li key={JSON.stringify([pick.team.sigla, pick.player])}>
        <div><BackToBack active={pick.backToBack} player/><strong>{pick.player}</strong><small>{pick.team.sigla} · {pick.sample.jogos} jogos</small></div>
        <dl className={showActual ? 'has-actual' : undefined}>
          {showActual && <div className="match-player-actual"><dt>{live?.event?.status === 'Finalizado' ? 'Final' : 'Ao vivo'}</dt>
            <dd>{number(live?.players?.get(livePlayerKey(pick.team.sigla, pick.player))?.[category])}</dd></div>}
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
