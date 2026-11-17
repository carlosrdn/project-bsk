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
  const { game } = match
  const started = Date.parse(live?.event?.start ?? game.horario_utc) <= Date.now()
  const showActual = live?.event?.status === 'Em andamento' || live?.event?.status === 'Finalizado'
  const actualLabel = live?.event?.status === 'Finalizado' ? 'Final' : 'Ao vivo'
  const players = rankRadar([match], {
    date: snapshot.data_jogos, current: true, injuries: snapshot.lesoes_ok, manual, calibration: snapshot.calibration
  }, category).sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score)

  return <section className="match-players" aria-label="Estatísticas e projeções de jogadores">
    {!started && !showActual && <>
      <h3>Indicações pré-jogo</h3>
      {picks.length ? <MarketPickCards picks={picks}/> : <p className="detail-explain">Sem entrada disponível para este jogo.</p>}
    </>}
    <h3>Estatísticas e projeções de jogadores</h3>
    <div className="player-categories" role="group" aria-label="Estatística dos jogadores">
      {categories.map(stat => <button type="button" className="refresh-btn" key={stat}
        aria-pressed={category === stat} onClick={() => setCategory(stat)}>{radarLabels[stat]}</button>)}
    </div>
    {[game.visitante, game.casa].map(team => {
      const rows = players.filter(pick => pick.team.sigla === team.sigla).map(pick => ({
        key: livePlayerKey(team.sigla, pick.player), name: pick.player, projection: pick
      }))
      const projectedKeys = new Set(rows.map(row => row.key))
      const actualOnly = showActual ? [...live?.players?.entries() ?? []]
        .filter(([key, player]) => player.team === team.sigla && !projectedKeys.has(key))
        .map(([key, player]) => ({ key, name: player.name, projection: undefined })) : []

      return <section className="match-player-team" key={team.sigla} aria-label={team.nome}>
        <h4>{team.nome} <small>{team === game.casa ? 'Mandante' : 'Visitante'}</small></h4>
        {!rows.length && !actualOnly.length ?
          <p className="detail-explain">Nenhuma estatística disponível para esta equipe.</p> :
          <ul className="match-player-list">
            {[...rows, ...actualOnly].map(({ key, name, projection }) => <li key={key}>
              <div>
                <BackToBack active={projection?.backToBack} player/>
                <strong>{name}</strong>
                {projection && <small>{projection.sample.jogos} jogos</small>}
              </div>
              <dl className={showActual ? 'has-actual' : undefined}>
                {showActual && <div className="match-player-actual"><dt>{actualLabel}</dt>
                  <dd>{number(live?.players?.get(key)?.[category])}</dd></div>}
                <div><dt>Projeção</dt><dd>{number(projection?.projected)}</dd></div>
                <div><dt>Média</dt><dd>{number(projection?.sample.media)}</dd></div>
                <div><dt>Últimos 5</dt><dd>{number(projection?.sample.ultimos5)}</dd></div>
              </dl>
              {projection && <small className={projection.eligible ? 'player-eligible' : undefined}>
                {projection.eligible ? 'Histórico consistente' : projection.alerts.join(' · ') || 'Variação histórica elevada'}
              </small>}
            </li>)}
          </ul>}
      </section>
    })}
  </section>
}
