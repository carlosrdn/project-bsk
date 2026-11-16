import { useEffect, useState } from 'react'

export type MarketPick = {
  game: string;
  startsAt: string; player: string; team: string; stat: 'pts' | 'reb' | 'ast' | 'tres'
  side: 'Acima' | 'Abaixo'; line: number; probability: number; sample: number; projection: number
}
type Feed = { date: string; picks: MarketPick[] }

export function useMarketPicks(date: string | undefined) {
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
  return { available: feed?.date === date && feed !== null,
    picks: feed?.date === date ? feed?.picks.filter(pick => Date.parse(pick.startsAt) > clock) ?? [] : [] }
}
