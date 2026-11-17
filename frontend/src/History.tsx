import { useEffect, useState } from 'react'
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
    <div className="history-game-grid">{rows.map(row => <div className="stat-tile" key={row.label}>
      <h4>{row.label}</h4>
      <Values values={[[ 'Projeção', number(row.expected)], ['Real', number(row.actual)]]}/>
      {row.key && <Limit target={p.targets?.[row.key]} correct={r?.comparison?.targets_correct?.[row.key]} finished={final}/>}
    </div>)}</div>
    <p>Favorito projetado <strong>{p.favorite || '—'}</strong> · Chance do mandante {percent(p.home_win_probability)} · Ritmo estimado {number(p.pace)}</p>
    {r?.comparison?.winner_correct != null && <p>{r.comparison.winner_correct ? 'Vencedor previsto corretamente' : 'Vencedor diferente do previsto'}</p>}
    {!!game.context && <p>Ausências pré-jogo · {game.away} {game.context.away_absences?.join(', ') || '—'} · {game.home} {game.context.home_absences?.join(', ') || '—'}</p>}
    {scored && Math.abs(home - away) >= 20 && <p>Placar elástico · margem final de {Math.abs(home - away)} pontos.</p>}
  </>
}

function GameCard({ game, players }: { game: HistoryGame; players: HistoryPlayer[] }) {
  const [view, setView] = useState('game')
  const r = game.result
  return <details className="stat-tile history-match">
    <summary>
      <strong>{game.away} × {game.home}</strong>
      <span className="history-match-meta"><time dateTime={game.date}>{dateLabel(game.date)}</time>
        {r?.status === 'finalizado' ? <><b>{number(r.away_score)} × {number(r.home_score)}</b><span>Final</span></> : <span>Resultado pendente</span>}
      </span>
    </summary>
    <div className="history-tabs">
      <button type="button" className="refresh-btn" aria-pressed={view === 'game'} onClick={() => setView('game')}>Jogo</button>
      <button type="button" className="refresh-btn" aria-pressed={view === 'players'} onClick={() => setView('players')}>Jogadores ({players.length})</button>
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
  const [day, setDay] = useState('')
  const [market, setMarket] = useState('')
  const [type, setType] = useState('')
  const [search, setSearch] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    loadHistory(controller.signal).then(data => {
      if (!controller.signal.aborted) setArchive(data)
    }).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Falha ao carregar histórico.')
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [revision])

  const games = (archive?.games ?? []).filter(game => !day || game.date === day).map(game => ({
    game, players: game.players.filter(player => (!market || player.market === market) &&
      (!type || player.classificacao === type) && normalize(player.player).includes(normalize(search)))
  }))
  const settled = games.flatMap(game => game.players).filter(player => player.result?.status === 'apurado')
  return <section className="history-view" aria-label="Histórico">
    <div className="lineup-toolbar">
      <button type="button" className="refresh-btn" disabled={loading} onClick={() => setRevision(value => value + 1)}>Recarregar arquivo</button>
    </div>
    {loading && <p role="status">Carregando histórico…</p>}
    {error && <p role="alert">{error}</p>}
    {archive && <>
      {archive.warnings.length > 0 && <details className="notice caution"><summary>{archive.warnings.length} rodada(s) com dados incompletos</summary>
        <ul>{archive.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
      </details>}
      <div className="history-filters">
        <label>Rodada<select value={day} onChange={event => setDay(event.target.value)}><option value="">Todas</option>
          {archive.days.map(date => <option key={date} value={date}>{dateLabel(date)}</option>)}</select></label>
        <label>Estatística<select value={market} onChange={event => setMarket(event.target.value)}><option value="">Todas</option>
          {Object.entries(markets).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Tipo de projeção<select value={type} onChange={event => setType(event.target.value)}><option value="">Todos</option>
          {Object.entries(classes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Jogador<input type="search" value={search} onChange={event => setSearch(event.target.value)}/></label>
      </div>
      {archive.updatedAt && <small>Índice atualizado em <time dateTime={archive.updatedAt}>{new Date(archive.updatedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} BRT</time></small>}
      <p className="history-result-count">{games.length} jogos arquivados · {settled.length} projeções individuais apuradas</p>
      {games.map(({ game, players }) => <GameCard key={game.key} game={game} players={players}/>)}
      {!games.length && <div className="empty-state"><strong>Nenhum confronto arquivado para a rodada selecionada.</strong></div>}
    </>}
  </section>
}
