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
    <Values values={[[ 'Projeção', number(player.projection)], ['Real', number(r?.actual)], ['Erro absoluto', number(r?.absolute_error)]]}/>
    <Limit target={player.target} correct={r?.target_correct} finished={r?.status === 'apurado'} unavailable={r?.status === 'nao_atuou' || r?.status === 'estatistica_indisponivel'}/>
    <p>{statuses[r?.status || ''] || 'Resultado não publicado'} · {number(player.sample)} jogos na amostra</p>
    {(player.context?.expected_minutes != null || r?.context?.actual_minutes != null) &&
      <p>Minutos de referência {number(player.context?.expected_minutes)} · reais {number(r?.context?.actual_minutes)}</p>}
    {!!r?.analysis?.fatores?.length && <ul>{r.analysis.fatores.map((factor, index) => <li key={index}>{factor.texto}</li>)}</ul>}
    <details>
      <summary>Dados da projeção</summary>
      <p>Média {number(player.season_mean)} · últimos cinco {number(player.last5)} · oscilação {number(player.sigma)}</p>
      {player.summary && <p>{player.summary}</p>}
      {player.warnings?.map(warning => <p key={warning}>{warning}</p>)}
    </details>
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
      <Values values={[[ 'Projeção', number(row.expected)], ['Real', number(row.actual)], ['Erro absoluto', number(row.actual == null ? null : Math.abs(row.actual - row.expected))]]}/>
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
    <details className="history-audit"><summary>Auditoria da coleta</summary>
      <p>Captura <time dateTime={game.capturedAt}>{game.capturedAt}</time></p><p>Versão do modelo <code>{game.modelHash}</code></p>
    </details>
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
  const individual = archive?.metrics?.geral
  const teams = archive?.metrics?.jogos
  const marketMetrics = Object.entries(archive?.metrics?.mercados ?? {})
  const highlighted = archive?.metrics?.destaques
  const contexts = Object.entries(archive?.metrics?.contextos ?? {}).sort((a, b) => (b[1].total ?? 0) - (a[1].total ?? 0))
  const settled = games.flatMap(game => game.players).filter(player => player.result?.status === 'apurado' &&
    typeof player.result.absolute_error === 'number' && Number.isFinite(player.result.absolute_error))
  const mae = market && settled.length ? settled.reduce((sum, player) => sum + (player.result?.absolute_error ?? 0), 0) / settled.length : null
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
      <section className="stat-tile history-metrics">
        <h2>Métricas arquivadas</h2>
        {archive.metrics ? <Values values={[
          ['Projeções individuais apuradas', individual?.total ?? 0], ['Limites individuais atingidos', individual?.acertos ?? 0],
          ['Limites individuais não atingidos', individual?.erros ?? 0], ['Taxa de acerto individual', percent(individual?.taxa_acerto)],
          ['Jogos com projeção apurada', teams?.total ?? 0], ['Vencedores previstos corretamente', teams?.vencedor_acertado ?? 0],
          ['Limites de equipes atingidos', teams?.limites_atingidos ?? 0], ['Erro médio de pontos por equipe', number(teams?.mae_pontos_equipes)]
        ]}/> : <p>Métricas consolidadas indisponíveis.</p>}
        {marketMetrics.length > 0 && <details className="history-audit"><summary>Desempenho por estatística</summary>
          <div className="history-table"><table><thead><tr><th>Estatística</th><th>Apuradas</th><th>Acertos</th><th>Erros</th><th>Taxa de acerto</th><th>Erro absoluto médio</th></tr></thead>
            <tbody>{marketMetrics.map(([key, value]) => <tr key={key}><th scope="row">{markets[key] || key}</th>
              <td>{value.total ?? 0}</td><td>{value.acertos ?? 0}</td><td>{value.erros ?? 0}</td>
              <td>{percent(value.taxa_acerto)}</td><td>{number(value.erro_absoluto_medio)}</td>
            </tr>)}</tbody>
          </table></div>
          {highlighted && <p>Projeções destacadas · {highlighted.total ?? 0} apuradas · {highlighted.acertos ?? 0} acertos · {highlighted.erros ?? 0} erros</p>}
        </details>}
        {contexts.length > 0 && <details className="history-audit"><summary>Contextos associados aos resultados</summary>
          <p>As ocorrências descrevem o contexto dos resultados. A amostra pode reunir vários fatores no mesmo jogo.</p>
          <ul>{contexts.map(([key, value]) => <li key={key}>{key.replaceAll('_', ' ')} · {value.total ?? 0} ocorrências · {value.acertos ?? 0} acertos · {value.erros ?? 0} erros</li>)}</ul>
        </details>}
      </section>
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
      <p className="history-result-count">{games.length} jogos arquivados · {settled.length} projeções individuais apuradas{mae != null && ' · Erro médio de ' + markets[market].toLowerCase() + ' ' + number(mae)}</p>
      {games.map(({ game, players }) => <GameCard key={game.key} game={game} players={players}/>)}
      {!games.length && <div className="empty-state"><strong>Nenhum confronto arquivado para a rodada selecionada.</strong></div>}
    </>}
  </section>
}
