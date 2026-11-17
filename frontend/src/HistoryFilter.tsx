import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

export default function HistoryFilter({ label, value, options, onChange }: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const field = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const id = useId()
  const selected = options.find(option => option.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !field.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [open])

  return <div className="history-filter" ref={field}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}
    onKeyDown={event => {
      if (event.key !== 'Escape' || !open) return
      event.preventDefault()
      setOpen(false)
      trigger.current?.focus()
    }}>
    <span id={id + '-label'}>{label}</span>
    <button className="history-filter-trigger" type="button" ref={trigger}
      aria-labelledby={id + '-label ' + id + '-value'} aria-expanded={open} aria-controls={id + '-options'}
      onClick={() => setOpen(previous => !previous)}>
      <span id={id + '-value'}>{selected?.label}</span><ChevronDown size={16} aria-hidden="true"/>
    </button>
    <div className="history-filter-options" id={id + '-options'} role="group" aria-labelledby={id + '-label'} hidden={!open}>
      {options.map(option => <button type="button" key={option.value} aria-pressed={option.value === value}
        onClick={() => { onChange(option.value); setOpen(false); trigger.current?.focus() }}>
        {option.label}{option.value === value && <Check size={16} aria-hidden="true"/>}
      </button>)}
    </div>
  </div>
}
