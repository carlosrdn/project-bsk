import { useEffect, useState } from 'react'
import { loadLiveStats, loadSchedule } from './lineup-espn'
import type { LivePlayerStats, ScheduledMatch } from './lineup-espn'

export interface LiveMatch {
  event?: ScheduledMatch
  players?: Map<string, LivePlayerStats>
  issue?: string
}

export function useLiveMatch(day: string, home: string, away: string) {
  const [live, setLive] = useState<LiveMatch>()
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    let timer: number | undefined
    let completed = false
    async function refresh() {
      setLoading(true)
      try {
        const schedule = await loadSchedule(day, signal)
        const event = schedule.find(game => game.home === home && game.away === away)
        if (signal.aborted) return
        if (!event) {
          setLive(previous => ({ ...previous, issue: 'Confronto ainda não localizado na ESPN.' }))
          return
        }
        if (!['Em andamento', 'Finalizado'].includes(event.status)) {
          setLive({ event })
          return
        }
        setLive(previous => ({ event, players: previous?.event?.id === event.id ? previous.players : undefined }))
        try {
          const players = await loadLiveStats(event.id, signal)
          if (signal.aborted) return
          if (!players.size) throw new Error('Box score vazio')
          setLive({ event, players })
          completed = event.status === 'Finalizado'
        } catch {
          if (!signal.aborted) setLive(previous => ({ ...previous, issue: 'Estatísticas da ESPN indisponíveis nesta atualização.' }))
        }
      } catch {
        if (!signal.aborted) setLive(previous => ({ ...previous, issue: 'Falha ao consultar a ESPN.' }))
      } finally {
        if (!signal.aborted) {
          setLoading(false)
          if (!completed) timer = window.setTimeout(refresh, 30000)
        }
      }
    }
    void refresh()
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [day, home, away, revision])

  return { live, loading, refresh: () => setRevision(value => value + 1) }
}
