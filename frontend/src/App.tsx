import { useEffect, useId, useMemo, useState } from 'react'
import {
 Activity, BarChart3, CalendarDays,
 ChevronDown, CircleAlert, Clock3, History,
 Lightbulb, RefreshCw, Search, SlidersHorizontal, Sparkles,
 TrendingUp, Users, X
} from 'lucide-react'
import Radar from './Radar'
import { useMarketPicks } from './useMarketPicks'
import type { MarketPick } from './useMarketPicks'
import BackToBack from './BackToBack'
import MatchPlayers from './MatchPlayers'
import LiveScore from './LiveScore'
import { useLiveMatch } from './useLiveMatch'
import Footer from './Footer'
import Backtest from './Backtest'
import RoundSchedule from './RoundSchedule'
import HistoryView from './History'
import Lineups from './Lineups'
import { loadSnapshot, nbaToday } from './data'
import { DEFAULT_PARAMS, predictGame } from './model'
import type { DataSnapshot, Game, GamePrediction } from './types'

const n = (value: number, decimals = 1) => value.toLocaleString('pt-BR', {
 minimumFractionDigits: decimals, maximumFractionDigits: decimals
})
const percent = (value: number) => n(value * 100, 1) + '%'
const date = (str: string) => {
 const [year, month, day] = str.split('-')
 return day + '/' + month + '/' + year
}
const time = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', {
 hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo'
})
interface MatchView {
 game: Game
 prediction: GamePrediction
 key: string
}
type View = 'games' | 'radar' | 'lineups' | 'history' | 'backtest'
const links = [
 { label: 'Jogos da rodada', icon: CalendarDays, view: 'games' as View },
 { label: 'Radar', icon: TrendingUp, view: 'radar' as View },
 { label: 'Escalações', icon: Users, view: 'lineups' as View },
 { label: 'Histórico', icon: History, view: 'history' as View },
 { label: 'Backtest', icon: BarChart3, view: 'backtest' as View }
]
function MiniBrand({ name }: { name: string }) {
 return <span className="mini-brand" aria-hidden="true">{name.slice(0, 3)}</span>
}
function MatchCard({ match, selected, onClick, panelId }: {
 match: MatchView; selected: boolean; onClick: () => void; panelId: string
}) {
 const { game, prediction } = match
 return <button type="button" className={'match-card ' + (selected ? 'selected' : '')} onClick={onClick}
  aria-expanded={selected} aria-controls={panelId}>
  <span className="match-card-top"><span><Clock3 size={13}/>{time(game.horario_utc)} · Brasília</span><span className="projection-pill">PROJEÇÃO</span></span>
  <span className="match-teams">
   <span className="score-row">
    <span className="team-name"><MiniBrand name={game.visitante.sigla}/><span><BackToBack active={game.visitante.back_to_back}/><strong>{game.visitante.sigla}</strong><small>{game.visitante.nome}</small></span></span>
    <strong className="score">{n(prediction.away, 0)}</strong>
   </span>
   <span className="score-row">
    <span className="team-name"><MiniBrand name={game.casa.sigla}/><span><BackToBack active={game.casa.back_to_back}/><strong>{game.casa.sigla}</strong><small>{game.casa.nome}</small></span></span>
    <strong className="score">{n(prediction.home, 0)}</strong>
   </span>
  </span>
  <span className="match-bottom"><span>Total previsto <b>{n(prediction.total)}</b></span><span><b>{prediction.favorite}</b> favorito <ChevronDown size={16} className={selected ? 'rotated' : ''} aria-hidden="true"/></span></span>
 </button>
}
function MatchContent({ match, snapshot, picks }: { match: MatchView; snapshot: DataSnapshot; picks: MarketPick[] }) {
 const { live, loading, refresh } = useLiveMatch(snapshot.data_jogos, match.game.casa.sigla, match.game.visitante.sigla)
 return <>
  <LiveScore live={live} loading={loading} refresh={refresh}/>
  <Detail match={match}/>
  <MatchPlayers match={match} snapshot={snapshot} live={live} picks={picks}/>
 </>
}
function ExpandableMatch({ match, snapshot, picks }: { match: MatchView; snapshot: DataSnapshot; picks: MarketPick[] }) {
 const [expanded, setExpanded] = useState(false)
 const panelId = useId()
 return <article className="expandable-match">
  <MatchCard match={match} selected={expanded} onClick={() => setExpanded(open => !open)} panelId={panelId}/>
  <div id={panelId} className="detail-panel" hidden={!expanded}>
   {expanded && <MatchContent match={match} snapshot={snapshot} picks={picks}/>}
  </div>
 </article>
}
function Detail({ match }: { match: MatchView }) {
 const { game, prediction: p } = match
 const [expanded, setExpanded] = useState(false)
 const contextId = useId()
 const absentHome = (game.casa.ausencias || []).filter(a => a.situacao === 'Fora')
 const absentAway = (game.visitante.ausencias || []).filter(a => a.situacao === 'Fora')
 return <div className="detail-content">
  <div className="detail-top"><span className="eyebrow">ANÁLISE DO CONFRONTO</span><span className="detail-date">{time(game.horario_utc)} BRT</span></div>
  <div className="detail-matchup">
   <div><MiniBrand name={game.visitante.sigla}/><strong>{game.visitante.sigla}</strong><small>Visitante</small></div>
   <div className="detail-vs">VS</div>
   <div><MiniBrand name={game.casa.sigla}/><strong>{game.casa.sigla}</strong><small>Mandante</small></div>
  </div>
  <div className="projected-line">
   <div><span>Pontos previstos</span><strong>{n(p.away, 1)}</strong></div>
   <span className="dash">—</span>
   <div><span>Pontos previstos</span><strong>{n(p.home, 1)}</strong></div>
  </div>
  <div className="separator"/>
  <h3>Projeção do modelo</h3>
  <div className="detail-stats">
   <div><span>Total do jogo</span><strong>{n(p.total)}</strong></div>
   <div><span>Margem da casa</span><strong>{p.margin >= 0 ? '+' : ''}{n(p.margin)}</strong></div>
   <div><span>Favorito</span><strong>{p.favorite}</strong></div>
  </div>
  <p className="detail-explain">Probabilidades estimadas para o confronto.</p>
  <div className="prob-label"><span>{game.visitante.sigla} · {percent(p.awayChance)}</span><span>{game.casa.sigla} · {percent(p.homeChance)}</span></div>
  <div className="prob-track"><div style={{width: p.awayChance * 100 + '%'}} /></div>
  <button type="button" className="expand-button" aria-expanded={expanded} aria-controls={contextId} onClick={() => setExpanded(open => !open)}>
   <span><SlidersHorizontal size={16}/> Contexto e desfalques</span><ChevronDown size={16} className={expanded ? 'rotated' : ''}/>
  </button>
  <div id={contextId} className="context-panel" hidden={!expanded}>
   <div><b>Desfalques confirmados · {game.visitante.sigla}</b>{absentAway.length ?
    <ul>{absentAway.map(x => <li key={x.nome}>{x.nome}</li>)}</ul> : <p>{game.visitante.ausencias === null ? 'Dados indisponíveis' : 'Nenhum registrado nesta coleta'}</p>}</div>
   <div><b>Desfalques confirmados · {game.casa.sigla}</b>{absentHome.length ?
    <ul>{absentHome.map(x => <li key={x.nome}>{x.nome}</li>)}</ul> : <p>{game.casa.ausencias === null ? 'Dados indisponíveis' : 'Nenhum registrado nesta coleta'}</p>}</div>
   <p className="small-note">Situações registradas no arquivo, não confirmadas em tempo real. Ajuste estimado por ausências: {n(p.injuryAway)} visitante · {n(p.injuryHome)} mandante.</p>
  </div>
 </div>
}
type Theme = 'system' | 'light' | 'dark'

function ThemeToggle() {
 const [theme, setTheme] = useState<Theme>(() => {
  try {
   const stored = localStorage.getItem('bsk-theme')
   if (stored === 'light' || stored === 'dark') return stored
  } catch { /* Use the device theme when storage is unavailable. */ }
  return 'system'
 })

 const [deviceDark, setDeviceDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
 useEffect(() => {
  const preference = window.matchMedia('(prefers-color-scheme: dark)')
  const update = () => setDeviceDark(preference.matches)
  update()
  preference.addEventListener('change', update)
  return () => preference.removeEventListener('change', update)
 }, [])

 useEffect(() => {
  document.documentElement.dataset.theme = theme
  try { localStorage.setItem('bsk-theme', theme) } catch { /* Keep the selected theme for this session. */ }
 }, [theme])

 const lit = theme === 'light' || (theme === 'system' && !deviceDark)
 return <button type="button" className="theme-toggle" aria-label="Modo claro" aria-pressed={lit}
  title={lit ? 'Apagar a luz' : 'Acender a luz'} onClick={() => setTheme(lit ? 'dark' : 'light')}>
  <Lightbulb size={19} aria-hidden="true"/>
 </button>
}

export default function App() {
 const [snapshot, setSnapshot] = useState<DataSnapshot | null>(null)
 const [error, setError] = useState<string | null>(null)
 const [loading, setLoading] = useState(true)
 const [today, setToday] = useState(nbaToday)
 const [revision, setRevision] = useState(0)
 const [view, setView] = useState<View>('games')
 const [search, setSearch] = useState('')
 const [onlyAbsences, setOnlyAbsences] = useState(false)
 useEffect(() => {
  const controller = new AbortController()
  let inFlight = false
  async function refresh() {
   if (inFlight) return
   inFlight = true
   setToday(nbaToday())
   try {
    const next = await loadSnapshot(controller.signal)
    if (controller.signal.aborted) return
    setSnapshot(previous => previous && Date.parse(previous.atualizado_em) >= Date.parse(next.atualizado_em) ? previous : next)
    setError(null)
   } catch (error) {
    if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Falha inesperada')
   } finally {
    inFlight = false
    if (!controller.signal.aborted) setLoading(false)
   }
  }
  const onVisible = () => { if (!document.hidden) void refresh() }
  void refresh()
  const timer = window.setInterval(onVisible, 30000)
  document.addEventListener('visibilitychange', onVisible)
  return () => {
   controller.abort()
   window.clearInterval(timer)
   document.removeEventListener('visibilitychange', onVisible)
  }
 }, [revision])
 const matches = useMemo(() => snapshot?.jogos.map(game => ({
  game,
  prediction: predictGame(game, snapshot.media_liga.ataque, { ...DEFAULT_PARAMS, ...snapshot.calibration?.team }),
  key: [game.horario_utc, game.visitante.sigla, game.casa.sigla].join('|')
 })).sort((a, b) => a.game.horario_utc.localeCompare(b.game.horario_utc)) || [], [snapshot])
 const shown = matches.filter(m => {
  const text = [m.game.casa.nome, m.game.visitante.nome, m.game.casa.sigla, m.game.visitante.sigla].join(' ').toLowerCase()
  if (!text.includes(search.toLowerCase())) return false
  return !onlyAbsences || [...(m.game.casa.ausencias || []), ...(m.game.visitante.ausencias || [])]
   .some(a => a.situacao === 'Fora')
 })
 const market = useMarketPicks(snapshot?.data_jogos === today ? today : undefined)
 const stale = !!snapshot && snapshot.data_jogos !== today
 const scheduleOnly = view === 'games' && (stale || (!snapshot && !loading))
 const missingInjuryData = !!snapshot && !snapshot.lesoes_ok
 const totalGames = matches.length
 const teams = matches.flatMap(({ game }) => [game.casa, game.visitante])
 const backToBackTeams = [...new Set(teams.filter(team => team.back_to_back === true).map(team => team.sigla))]
 const backToBackChecked = teams.length > 0 && teams.every(team => typeof team.back_to_back === 'boolean')
 const favoriteHome = matches.filter(m => m.prediction.favorite === m.game.casa.sigla).length
 const highTotal = matches.filter(m => m.prediction.total >= 230).length
 return <div className="app-shell">
  <header className="site-header">
   <div className="site-header-inner">
    <button type="button" className="site-logo" onClick={() => setView('games')} aria-label="BSK Analytics, Jogos da rodada">
     <span className="logo-mark"><Activity size={22} strokeWidth={2.3} aria-hidden="true"/></span><span>BSK <small>Analytics</small></span>
    </button>
    <nav className="nav-stack" aria-label="Navegação principal">{links.map(l =>
     <button type="button" key={l.view} className="nav-item" aria-current={view === l.view ? 'page' : undefined}
      onClick={() => setView(l.view)}><l.icon size={16} aria-hidden="true"/>{l.view === 'games' ? 'Jogos' : l.label}</button>
    )}</nav>
    <div className="header-controls"><ThemeToggle/>
    {view !== 'history' && view !== 'backtest' && <button type="button" className="refresh-btn header-refresh" aria-label="Atualizar dados"
     onClick={() => { setLoading(true); setRevision(value => value + 1) }} disabled={loading}>
     <RefreshCw size={16} className={loading ? 'spin' : ''} aria-hidden="true"/><span>Atualizar</span>
    </button>}</div>
   </div>
  </header>
   <main className="content">
    <div className="page-heading"><div><h1>{view === 'backtest' ? 'Backtest do motor' : view === 'history' ? 'Histórico de projeções' : view === 'lineups' ? 'Escalações da rodada' : view === 'radar' ? 'Radar da rodada' : 'Jogos da rodada'}</h1><p>{view === 'backtest' ? 'Desempenho do motor React em partidas anteriores.' : view === 'history' ? 'Projeções registradas antes dos jogos, resultados e métricas de desempenho.' : view === 'lineups' ? 'Titulares confirmados, quintetos projetados e desfalques por confronto.' : view === 'radar' ? 'Acima ou abaixo das linhas pré-jogo da rodada.' : 'Projeções baseadas nos dados da temporada 2026–27.'}</p></div></div>
    {view === 'backtest' ? <Backtest snapshot={snapshot}/> : view === 'history' ? <HistoryView/> : <>
    {error && <section className="notice error-notice"><CircleAlert size={20}/><div><b>{snapshot ? 'Falha ao atualizar os dados' : 'Dados indisponíveis'}</b><p>{error}</p></div></section>}
    {loading && <section className="loading-card"><RefreshCw className="spin" size={24}/><p>Carregando dados e calculando projeções…</p></section>}
    {scheduleOnly && <>
     {stale && <section className="notice caution"><CircleAlert size={19}/><div><b>Projeções da rodada pendentes</b><p>A última coleta é de {date(snapshot.data_jogos)}.</p></div></section>}
     <RoundSchedule key={today} day={today}/>
     <p className="detail-explain">Back-to-back (B2B) · Aguardando a coleta da rodada.</p>
    </>}
    {snapshot && !scheduleOnly && <>
     {(stale || missingInjuryData) && <section className="notice caution"><CircleAlert size={19}/><div><b>{stale ? 'Arquivo de outra rodada' : 'Verificação de lesões indisponível'}</b><p>{stale ? 'A coleta disponível é de ' + date(snapshot.data_jogos) + '. Estes números são uma visualização do snapshot, não previsões atualizadas para hoje.' : 'Desfalques podem estar incompletos. Confira antes de usar estas projeções.'}</p></div></section>}
     {view === 'lineups' ? <Lineups key={snapshot.data_jogos} snapshot={snapshot} current={!stale}/> : view === 'radar' ? <>
      <Radar picks={market.picks} available={market.available} snapshot={snapshot}
        current={!stale} clock={market.clock}/>
     </> : <>
     <dl className="round-summary" aria-label="Resumo da rodada">
      <div><dt>Partidas</dt><dd>{totalGames}</dd></div>
      <div><dt>Mandantes favoritos</dt><dd>{favoriteHome}</dd></div>
      <div><dt>Totais ≥ 230</dt><dd>{highTotal}</dd></div>
     </dl>
     <p className="detail-explain" style={{ margin: '0 0 12px' }}>
      <strong>Back-to-back (B2B)</strong> · {backToBackTeams.length
       ? backToBackTeams.join(', ') + (backToBackChecked ? '' : ' · verificação parcial')
       : backToBackChecked ? 'Nenhuma equipe jogou na noite anterior.' : 'Dados de descanso indisponíveis nesta coleta.'}
     </p>
     <div className="game-toolbar"><div className="search-box"><Search size={18}/><input aria-label="Buscar equipe" placeholder="Buscar equipe ou sigla…" value={search} onChange={e => setSearch(e.target.value)}/>{search && <button onClick={() => setSearch('')} aria-label="Limpar busca"><X size={16}/></button>}</div><label className="checkbox-filter"><input type="checkbox" checked={onlyAbsences} onChange={e => setOnlyAbsences(e.target.checked)}/> Com desfalques confirmados</label>{shown.length !== totalGames && <span className="count-label">{shown.length} de {totalGames} partidas</span>}</div>
     {!shown.length ?
      <div className="empty-state"><Search size={25}/><strong>{matches.length ? 'Nenhum confronto encontrado' : 'Nenhum confronto nesta rodada'}</strong>{matches.length > 0 && <span>Altere a busca ou remova os filtros.</span>}</div> :
      <div className="matches-column">{shown.map(match =>
       <ExpandableMatch key={match.key} match={match} snapshot={snapshot} picks={market.picks.filter(pick =>
        pick.game === JSON.stringify([match.game.horario_utc, match.game.casa.sigla, match.game.visitante.sigla]))}/>
      )}</div>}
     <div className="methodology"><Sparkles size={18}/><div><strong>Sobre as projeções</strong><p>Os pontos, o total e o favorito usam médias de equipe, ritmo e contexto disponível. O Backtest compara as estimativas com os resultados de partidas anteriores.</p></div></div>
     </>}
    </>}
    </>}
    <Footer/>
   </main>
 </div>
}
