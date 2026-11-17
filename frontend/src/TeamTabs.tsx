import { useId, useState, type ReactNode } from 'react'

type Team = { code: string; name: string }

export default function TeamTabs({ away, home, children }: {
  away: Team
  home: Team
  children: (team: Team) => ReactNode
}) {
  const [selected, setSelected] = useState(0)
  const id = useId()

  return <>
    <div className="team-tabs" role="tablist" aria-label="Equipes">
      {[away, home].map((team, index) => {
        const active = selected === index
        return <button type="button" key={team.code} className="team-tab" role="tab" id={id + '-team-' + index}
          aria-selected={active} aria-controls={id + '-panel-' + index} tabIndex={active ? 0 : -1}
          onClick={() => setSelected(index)}
          onKeyDown={event => {
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 :
              event.key === 'ArrowRight' || event.key === 'ArrowLeft' ? 1 - index : undefined
            if (next === undefined) return
            event.preventDefault()
            setSelected(next)
            event.currentTarget.parentElement?.querySelectorAll('button')[next]?.focus()
          }}>
          <strong>{team.name}</strong><small>{index === 0 ? 'Visitante' : 'Mandante'}</small>
        </button>
      })}
    </div>
    {[away, home].map((team, index) => <section key={team.code} role="tabpanel" className="match-player-team"
      id={id + '-panel-' + index} aria-labelledby={id + '-team-' + index} hidden={selected !== index}
      tabIndex={selected === index ? 0 : -1}>
      {selected === index && children(team)}
    </section>)}
  </>
}
