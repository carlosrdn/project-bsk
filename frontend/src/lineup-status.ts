import { useEffect, useState } from 'react'

export const automatic = 'Não verificado'
export const statusOptions = [automatic, 'Titular confirmado', 'Disponível confirmado', 'Provável', 'Questionável', 'Improvável', 'Fora']
const storageKey = 'bsk-escalações-v1'

export function playerKey(date: string, team: string, name: string) {
  return [date, team, name].join('|')
}

export function readStatuses(): Record<string, string> {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value).filter(([, status]) =>
      typeof status === 'string' && status !== automatic && statusOptions.includes(status)
    )) as Record<string, string>
  } catch {
    return {}
  }
}

export function useManualStatuses() {
  const [manual, setManual] = useState(readStatuses)
  const [error, setError] = useState('')
  useEffect(() => {
    const update = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) setManual(readStatuses())
    }
    window.addEventListener('storage', update)
    return () => window.removeEventListener('storage', update)
  }, [])

  function save(change: (latest: Record<string, string>) => void) {
    const next = readStatuses()
    change(next)
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
      setManual(next)
      setError('')
    } catch {
      setError('O navegador não conseguiu salvar as correções manuais.')
    }
  }

  return { manual, save, error }
}
