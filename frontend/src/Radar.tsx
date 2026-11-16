import { radarLabels } from './radar-model'
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

export default function Radar({ picks, available, validated }: { picks: MarketPick[]; available: boolean; validated: boolean }) {
  return <section className="radar" aria-labelledby="radar-selected">
    <div className="section-head"><h2 id="radar-selected">Indicações pré-jogo</h2></div>
    {picks.length ? <MarketPickCards picks={picks}/> : <div className="empty-state">
      <strong>Sem entrada disponível</strong>
      <span>{!available ? 'Indicações da rodada ainda indisponíveis.' : !validated
        ? 'Aguardando validação do modelo para liberar indicações.'
        : 'Nenhuma indicação pré-jogo ativa para esta rodada.'}</span>
    </div>}
  </section>
}
