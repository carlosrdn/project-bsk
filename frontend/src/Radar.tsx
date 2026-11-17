import { useState } from 'react'
import { Info } from 'lucide-react'
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
    {picks.length > 0 && <section className="radar" aria-labelledby="radar-selected">
      <h2 id="radar-selected">Indicações pré-jogo</h2>
      <MarketPickCards picks={picks}/>
    </section>}
    <section className="projection-panel stat-tile" aria-labelledby="radar-projections">
      <h2 id="radar-projections">Projeções para os próximos jogos</h2>
      {pending.length > 0 && <>
        <div className="player-categories" role="group" aria-label="Estatística das projeções">
          {categories.map(stat => <button type="button" className="refresh-btn" key={stat}
            aria-pressed={category === stat} onClick={() => setCategory(stat)}>{radarLabels[stat]}</button>)}
        </div>
        {projections.length ? <div className="projection-table-wrap" tabIndex={0} role="region" aria-label="Tabela de projeções">
          <table className="projection-table">
            <thead><tr><th scope="col">Jogador</th><th scope="col">Projeção</th><th scope="col">Média</th><th scope="col">Últimos 5</th><th scope="col">Jogos</th></tr></thead>
            <tbody>{projections.map(pick =>
              <tr key={JSON.stringify([pick.game.horario_utc, pick.team.sigla, pick.player])}>
                <th scope="row"><strong>{pick.player}</strong><small>{pick.team.sigla} × {pick.opponent.sigla}</small>
                  {pick.alerts.length > 0 && <small className="projection-alert">{pick.alerts.join(' · ')}</small>}
                </th>
                <td className="projection-value">{number(pick.projected)}</td>
                <td>{number(pick.sample.media)}</td><td>{number(pick.sample.ultimos5)}</td><td>{pick.sample.jogos}</td>
              </tr>
            )}</tbody>
          </table>
        </div> : <p className="detail-explain">Amostra insuficiente para esta estatística nos jogos restantes.</p>}
      </>}
      {!pending.length && <p className="detail-explain">
        {current ? 'As projeções ficam disponíveis antes do início de cada partida.' : 'Aguardando os dados da rodada atual.'}
      </p>}
    </section>
    {!picks.length && <p className="radar-status"><Info size={16} aria-hidden="true"/><span>
      <strong>Indicações pré-jogo</strong>
      {!current ? 'Aguardando a coleta da rodada.' : !pending.length ? 'Nenhum jogo por começar nesta rodada.' :
        !available ? 'Aguardando a publicação das indicações da rodada.' : !validated ?
          'Aguardando validação suficiente para publicar indicações.' : 'Nenhuma indicação ativa para os jogos restantes.'}
    </span></p>}
  </div>
}
