import { Info } from 'lucide-react'
import { radarLabels } from './radar-model'
import type { DataSnapshot } from './types'
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


export default function Radar({ picks, available, snapshot, current, clock }: {
  picks: MarketPick[]
  available: boolean
  snapshot: DataSnapshot
  current: boolean
  clock: number
}) {
  const pending = current && snapshot.jogos.some(game => Date.parse(game.horario_utc) > clock)
  const validated = (['pts', 'reb', 'ast', 'tres'] as const).some(stat =>
    snapshot.calibration?.thresholds[stat] || snapshot.marketReference?.categories[stat]?.approved)

  return <section className="radar" aria-labelledby="radar-selected">
    <h2 id="radar-selected">Indicações pré-jogo</h2>
    {picks.length ? <MarketPickCards picks={picks}/> :
      <p className="radar-status"><Info size={16} aria-hidden="true"/><span>{
        !current ? 'Aguardando a coleta da rodada.' :
          !pending ? 'Nenhum jogo por começar nesta rodada.' :
          !available ? 'Aguardando as linhas pré-jogo da rodada.' :
          !validated ? 'Aguardando validação do modelo.' :
          'Nenhuma indicação atingiu os critérios do Radar.'
      }</span></p>}
  </section>
}
