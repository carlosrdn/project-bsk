import { useState } from 'react'
import { radarLabels, rankRadar } from './radar-model'
import { useManualStatuses } from './lineup-status'
import type { DataSnapshot, Game, GamePrediction, PlayerStatCategory } from './types'
import type { MarketPick } from './useMarketPicks'

export function MarketPickCards({ picks }: { picks: MarketPick[] }) {
  return <div className="radar-grid">{picks.map(pick =>
      <article className="stat-tile radar-card" key={JSON.stringify([pick.startsAt, pick.team, pick.player])}>
        <h3>{pick.player} · {pick.team}</h3>
        <p>{pick.side} de {pick.line.toLocaleString('pt-BR')} · {radarLabels[pick.stat]}</p>
        <p>{pick.probability.toLocaleString('pt-BR', { style: 'percent', maximumFractionDigits: 1 })} estimados pelo BSK</p>
        <p>{pick.sample} jogos na amostra · projeção {pick.projection.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</p>
      </article>
    )}</div>
}

const categories = Object.keys(radarLabels) as PlayerStatCategory[]
const number = (value: number | null | undefined) => value == null ? '—' :
  value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })

export default function Radar({ picks, available, snapshot, matches, current, clock }: {
  picks: MarketPick[]
  available: boolean
  snapshot: DataSnapshot
  matches: { game: Game; prediction: GamePrediction }[]
  current: boolean
  clock: number
}) {
  const [category, setCategory] = useState<PlayerStatCategory>('pts')
  const { manual } = useManualStatuses()
  const pending = current ? matches.filter(({ game }) => Date.parse(game.horario_utc) > clock) : []
  const projections = rankRadar(pending, {
    date: snapshot.data_jogos, current, injuries: snapshot.lesoes_ok, manual, calibration: snapshot.calibration
  }, category).sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score).slice(0, 8)
  const validated = (['pts', 'reb', 'ast', 'tres'] as const).some(stat =>
    snapshot.calibration?.thresholds[stat] || snapshot.marketReference?.categories[stat]?.approved)

  return <div className="history-view">
    <section className="radar" aria-labelledby="radar-selected">
      <div className="section-head"><h2 id="radar-selected">Indicações pré-jogo</h2></div>
      {picks.length ? <MarketPickCards picks={picks}/> : <p className="detail-explain">
        {!current ? 'Aguardando a coleta da rodada.' : !pending.length ? 'Nenhum jogo por começar nesta rodada.' :
          !available ? 'Aguardando a publicação das indicações da rodada.' : !validated ?
            'Aguardando validação suficiente para publicar indicações.' : 'Nenhuma indicação ativa para os jogos restantes.'}
      </p>}
    </section>
    <section className="radar" aria-labelledby="radar-projections">
      <div className="section-head"><h2 id="radar-projections">Projeções para os próximos jogos</h2></div>
      {pending.length > 0 && <>
        <div className="player-categories" role="group" aria-label="Estatística das projeções">
          {categories.map(stat => <button type="button" className="refresh-btn" key={stat}
            aria-pressed={category === stat} onClick={() => setCategory(stat)}>{radarLabels[stat]}</button>)}
        </div>
        {projections.length ? <div className="radar-grid">{projections.map(pick =>
          <article className="stat-tile radar-card" key={JSON.stringify([pick.game.horario_utc, pick.team.sigla, pick.player])}>
            <h3>{pick.player} · {pick.team.sigla}</h3>
            <p>{pick.team.sigla} × {pick.opponent.sigla} · {radarLabels[pick.stat]}</p>
            <p><strong>{number(pick.projected)}</strong> projetados · média {number(pick.sample.media)} · últimos 5 {number(pick.sample.ultimos5)}</p>
            <p>{pick.sample.jogos} jogos na amostra{pick.alerts.length > 0 && ' · ' + pick.alerts.join(' · ')}</p>
          </article>
        )}</div> : <p className="detail-explain">Amostra insuficiente para esta estatística nos jogos restantes.</p>}
      </>}
      {!pending.length && <p className="detail-explain">
        {current ? 'As projeções ficam disponíveis antes do início de cada partida.' : 'Aguardando os dados da rodada atual.'}
      </p>}
    </section>
  </div>
}
