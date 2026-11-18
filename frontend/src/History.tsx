import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, RefreshCw, Search, X } from 'lucide-react'
import HistoryFilter from './HistoryFilter'
import { loadHistory } from './history-data'
import type { HistoryArchive, HistoryGame, HistoryPlayer, Target } from './history-data'

const markets: Record<string, string> = { pts: 'Pontos', reb: 'Rebotes', ast: 'Assistências', tres: 'Bolas de três', blk: 'Bloqueios', stl: 'Roubos' }
const classes: Record<string, string> = { principal: 'Projeção destacada', observacao: 'Em observação', monitoramento: 'Monitoramento automático' }
const statuses: Record<string, string> = {
  apurado: 'Apurado', aguardando: 'Aguardando', jogo_nao_finalizado: 'Jogo pendente',
  jogo_nao_localizado: 'Jogo não localizado', boxscore_indisponivel: 'Box score indisponível',
  jogador_nao_localizado: 'Jogador não localizado', nao_atuou: 'Não entrou em quadra',
  estatistica_indisponivel: 'Estatística indisponível'
}
const number = (value?: number | null) => typeof value === 'number' && Number.isFinite(value)
  ? value.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '—'
const dateLabel = (value: string) => value.split('-').reverse().join('/')
const percent = (value?: number | null) => value == null ? '—' : number(value * 100) + '%'
const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()

function Limit({ target, correct, finished, unavailable }: { target?: Target; correct?: boolean | null; finished: boolean; unavailable?: boolean }) {
  if (target?.direction !== 'acima_de' || !Number.isFinite(target.threshold)) return null
  const status = correct === true && finished ? 'Acertou' : correct === false && finished ? 'Não acertou' : finished || unavailable ? 'Sem apuração' : 'Pendente'
  return <p>Acima de {number(target.threshold)} · <strong>{status}</strong></p>
}

function Values({ values }: { values: [string, string | number][] }) {
  return <dl className="history-values">{values.map(([label, value]) =>
    <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
  )}</dl>
}

function PlayerCard({ player }: { player: HistoryPlayer }) {
  const r = player.result
  return <article className="stat-tile history-player">
    <h4>{player.player}</h4>
    <p>{player.team} · {markets[player.market] || player.market} · {classes[player.classificacao] || player.classificacao}</p>
    <Values values={[[ 'Projeção', number(player.projection)], ['Real', number(r?.actual)]]}/>
    <Limit target={player.target} correct={r?.target_correct} finished={r?.status === 'apurado'} unavailable={r?.status === 'nao_atuou' || r?.status === 'estatistica_indisponivel'}/>
    <p>{statuses[r?.status || ''] || 'Resultado não publicado'} · {number(player.sample)} jogos na amostra</p>
    {(player.context?.expected_minutes != null || r?.context?.actual_minutes != null) &&
      <p>Minutos de referência {number(player.context?.expected_minutes)} · reais {number(r?.context?.actual_minutes)}</p>}
    <p>Média da temporada {number(player.season_mean)} · últimos cinco jogos {number(player.last5)}</p>
  </article>
}

function GameDetails({ game }: { game: HistoryGame }) {
  const p = game.prediction
  const r = game.result
  if (!p) return <p>Partida arquivada antes de o BSK registrar projeções de equipe.</p>
  const final = r?.status === 'finalizado'
  const away = final ? r.away_score : null
  const home = final ? r.home_score : null
  const scored = away != null && home != null
  const rows = [
    { label: game.away, key: 'away_points', expected: p.away_points, actual: away },
    { label: game.home, key: 'home_points', expected: p.home_points, actual: home },
    { label: 'Total de pontos', key: 'total_points', expected: p.total_points, actual: scored ? away + home : null },
    { label: 'Margem do mandante', key: null, expected: p.home_margin, actual: scored ? home - away : null }
  ] as const
  return <>
    <div className="history-table" role="region" aria-label="Projeção e resultado do jogo" tabIndex={0}>
      <table className="history-comparison">
        <thead><tr><th scope="col">Estatística</th><th scope="col">Projeção</th><th scope="col">Resultado</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.label}>
          <th scope="row">{row.label}
            {row.key && <Limit target={p.targets?.[row.key]} correct={r?.comparison?.targets_correct?.[row.key]} finished={final}/>}
          </th>
          <td>{number(row.expected)}</td><td>{number(row.actual)}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <p>Favorito projetado <strong>{p.favorite || '—'}</strong> · Chance do mandante {percent(p.home_win_probability)} · Ritmo estimado {number(p.pace)}</p>
    {r?.comparison?.winner_correct != null && <p>{r.comparison.winner_correct ? 'Vencedor previsto corretamente' : 'Vencedor diferente do previsto'}</p>}
    {!!game.context && <p>Ausências pré-jogo · {game.away} {game.context.away_absences?.join(', ') || '—'} · {game.home} {game.context.home_absences?.join(', ') || '—'}</p>}
    {scored && Math.abs(home - away) >= 20 && <p>Placar elástico · margem final de {Math.abs(home - away)} pontos.</p>}
  </>
}

function GameCard({ game, players, playerFilter }: { game: HistoryGame; players: HistoryPlayer[]; playerFilter: boolean }) {
  const defaultView = playerFilter ? 'players' : 'game'
  const [selection, setSelection] = useState<{ group: boolean; view: 'game' | 'players' }>()
  const view = selection?.group === playerFilter ? selection.view : defaultView
  const select = (next: 'game' | 'players') => setSelection({ group: playerFilter, view: next })
  const r = game.result
  const final = r?.status === 'finalizado'
  return <details className="stat-tile history-match history-result">
    <summary>
      <span className="history-teams" aria-label={game.away + ' contra ' + game.home}>
        <strong>{game.away}</strong><span className="history-score">{final ? number(r.away_score) + ' × ' + number(r.home_score) : '×'}</span><strong>{game.home}</strong>
      </span>
      <span className={'history-match-status' + (final ? ' history-match-final' : '')}>{final ? 'Final' : 'Resultado pendente'}</span>
      <ChevronDown size={16} aria-hidden="true"/>
    </summary>
    <div className="history-tabs">
      <button type="button" className="refresh-btn" aria-pressed={view === 'game'} onClick={() => select('game')}>Jogo</button>
      <button type="button" className="refresh-btn" aria-pressed={view === 'players'} onClick={() => select('players')}>Jogadores ({players.length})</button>
    </div>
    {view === 'game' ? <GameDetails game={game}/> : players.length ? <div className="history-game-grid">
      {players.map(player => <PlayerCard key={player.id} player={player}/>)}
    </div> : <p>{game.players.length ? 'Nenhuma projeção corresponde aos filtros.' : 'Nenhuma projeção individual arquivada para este jogo.'}</p>}
  </details>
}

export default function HistoryView() {
  const [archive, setArchive] = useState<HistoryArchive>()
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [day, setDay] = useState<string>()
  const [market, setMarket] = useState('')
  const [team, setTeam] = useState('')
  const [search, setSearch] = useState('')
  const searchId = useId()
  const searchInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const controller = new AbortController()
    let running = false
    async function update() {
      if (running) return
      running = true
      try {
        const data = await loadHistory(controller.signal)
        if (!controller.signal.aborted) { setArchive(data); setError('') }
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Falha ao carregar histórico.')
      } finally {
        running = false
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    const visible = () => { if (!document.hidden) void update() }
    void update()
    const timer = window.setInterval(visible, 60000)
    document.addEventListener('visibilitychange', visible)
    return () => {
      controller.abort()
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [revision])

  const allGames = archive?.games ?? []
  const activeDay = day ?? allGames[0]?.date ?? archive?.days[0] ?? ''
  const teams = [...new Set(allGames.flatMap(game => [game.away, game.home]))].sort()
  const query = normalize(search)
  const playerFilter = !!(query || market)
  const games = allGames
    .filter(game => (!activeDay || game.date === activeDay) && (!team || game.away === team || game.home === team))
    .map(game => ({ game, players: game.players.filter(player =>
      (!market || player.market === market) && (!team || !playerFilter || player.team === team) && normalize(player.player).includes(query)) }))
    .filter(item => !playerFilter || item.players.length > 0)
  const byDay = new Map<string, typeof games>()
  for (const item of games) {
    const group = byDay.get(item.game.date) ?? []
    if (!byDay.has(item.game.date)) byDay.set(item.game.date, group)
    group.push(item)
  }

  return <section className="history-view" aria-label="Histórico">
    {loading && <p role="status">Carregando histórico…</p>}
    {error && <div className="notice error-notice" role="alert">
      <span>{error}</span><button type="button" className="refresh-btn" onClick={() => setRevision(value => value + 1)}>Tentar novamente</button>
    </div>}
    {archive && <>
      <div className="stat-tile history-controls">
        <div className="history-filters">
          <HistoryFilter label="Rodada" value={activeDay} onChange={setDay}
            options={[{ value: '', label: 'Todas' }, ...archive.days.map(date => ({ value: date, label: dateLabel(date) }))]}/>
          <HistoryFilter label="Time" value={team} onChange={setTeam}
            options={[{ value: '', label: 'Todos' }, ...teams.map(code => ({ value: code, label: code }))]}/>
          <div className="history-filter">
            <label htmlFor={searchId}>Jogador</label>
            <div className="history-filter-search">
              <Search size={16} aria-hidden="true"/>
              <input id={searchId} ref={searchInput} type="search" value={search} placeholder="Nome do jogador"
                onChange={event => setSearch(event.target.value)}/>
              {search && <button type="button" aria-label="Limpar busca por jogador"
                onClick={() => { setSearch(''); searchInput.current?.focus() }}>
                <X size={15} aria-hidden="true"/>
              </button>}
            </div>
          </div>
          <HistoryFilter label="Estatística" value={market} onChange={setMarket}
            options={[{ value: '', label: 'Todas' }, ...Object.entries(markets).map(([value, label]) => ({ value, label }))]}/>
        </div>
        <div className="history-controls-actions">
          <p className="history-result-count" aria-live="polite">{games.length} {games.length === 1 ? 'jogo' : 'jogos'}</p>
          {(activeDay || team || playerFilter) && <button type="button" className="refresh-btn"
            onClick={() => { setDay(''); setTeam(''); setSearch(''); setMarket('') }}>Limpar filtros</button>}
          <button type="button" className="refresh-btn" disabled={loading} onClick={() => setRevision(value => value + 1)}>
            <RefreshCw size={14} aria-hidden="true"/> Atualizar
          </button>
        </div>
      </div>
      {archive.warnings.length > 0 && <details className="notice caution"><summary>{archive.warnings.length} rodada(s) com dados incompletos</summary>
        <ul>{archive.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
      </details>}
      {[...byDay].map(([date, items]) => <section className="history-round" key={date} aria-label={'Rodada de ' + dateLabel(date)}>
        <h2><time dateTime={date}>{dateLabel(date)}</time></h2>
        {items.map(({ game, players }) => <GameCard key={game.key} game={game} players={players} playerFilter={playerFilter}/>)}
      </section>)}
      {!games.length && <div className="empty-state"><strong>Nenhum jogo encontrado com esses filtros.</strong></div>}
    </>}
  </section>
}
