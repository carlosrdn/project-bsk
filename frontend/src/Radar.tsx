import { useEffect, useState } from 'react'
import { radarLabels } from './radar-model'
import type { DataSnapshot } from './types'

type Pick = {
  startsAt: string; player: string; team: string; stat: 'pts' | 'reb' | 'ast' | 'tres'
  side: 'Acima' | 'Abaixo'; line: number; probability: number; sample: number; projection: number
}
type Feed = { date: string; picks: Pick[] }

export default function Radar({ snapshot, current }: { snapshot: DataSnapshot; current: boolean }) {
  const [feed, setFeed] = useState<Feed | null>(null)
  const [clock, setClock] = useState(Date.now)
  useEffect(() => {
    const controller = new AbortController()
    const refresh = () => {
      setClock(Date.now())
      const root = new URL(import.meta.env.BASE_URL, window.location.origin)
      const url = new URL(import.meta.env.DEV ? '/mercados-bsk/atual.json' : '../mercados-bsk/atual.json', root)
      void fetch(url, { signal: controller.signal, cache: 'no-store' }).then(async response => {
        if (!response.ok) throw Error('Feed indisponível')
        const next: Feed = await response.json()
        if (!Array.isArray(next.picks)) throw Error('Feed inválido')
        if (!controller.signal.aborted) setFeed(next)
      }).catch(() => {})
    }
    refresh()
    const timer = window.setInterval(refresh, 60000)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [])
  const selected = current && feed?.date === snapshot.data_jogos
    ? feed.picks.filter(pick => Date.parse(pick.startsAt) > clock) : []
  return <section className="radar" aria-labelledby="radar-selected">
    <div className="section-head"><h2 id="radar-selected">Indicações pré-jogo</h2></div>
    {selected.length ? <div className="radar-grid">{selected.map(pick =>
      <article className="stat-tile radar-card" key={JSON.stringify([pick.startsAt, pick.team, pick.player])}>
        <h3>{pick.player} · {pick.team}</h3>
        <p>{pick.side} de {pick.line.toLocaleString('pt-BR')} · {radarLabels[pick.stat]}</p>
        <p>{pick.probability.toLocaleString('pt-BR', { style: 'percent', maximumFractionDigits: 1 })} estimados pelo BSK</p>
        <p>{pick.sample} jogos na amostra · projeção {pick.projection.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</p>
      </article>
    )}</div> : <div className="empty-state">
      <strong>Sem entrada disponível</strong>
      <span>{feed?.date === snapshot.data_jogos ? 'Nenhuma indicação pré-jogo ativa para esta rodada.' :
        'Indicações da rodada ainda indisponíveis.'}</span>
    </div>}
  </section>
}
