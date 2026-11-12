import { useEffect, useMemo, useState } from 'react'
import {
 Activity, ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, CalendarDays, Check,
 ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Clock3, Database, History,
 LayoutDashboard, Menu, RefreshCw, Search, ShieldCheck, SlidersHorizontal, Sparkles,
 TrendingUp, Users, X
} from 'lucide-react'
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
const outside = (file: string) => new URL('../' + file, new URL(
 import.meta.env.BASE_URL, window.location.origin)).toString()

interface MatchView {
 game: Game
 prediction: GamePrediction
 key: string
}
type View = 'overview' | 'games'
const links = [
 { label: 'Visão geral', icon: LayoutDashboard, view: 'overview' as View },
 { label: 'Jogos da rodada', icon: CalendarDays, view: 'games' as View }
]
const shortcuts = [
 { label: 'Radar', icon: TrendingUp, file: 'melhores.html' },
 { label: 'Escalações', icon: Users, file: 'escalacoes.html' },
 { label: 'Histórico', icon: History, file: 'historico.html' },
 { label: 'Backtest', icon: BarChart3, file: 'backtest.html' }
]
function MiniBrand({ name }: { name: string }) {
 return <span className="mini-brand" aria-hidden="true">{name.slice(0, 3)}</span>
}
function StatTile({ label, value, note, icon: Icon }: {
 label: string; value: string; note: string; icon: typeof Activity
}) {
 return <div className="stat-tile">
  <div className="stat-top"><span>{label}</span><Icon size={17} /></div>
  <strong>{value}</strong><small>{note}</small>
 </div>
}
function MatchCard({ match, selected, onClick }: { match: MatchView; selected: boolean; onClick: () => void }) {
 const { game, prediction } = match
 return <button type="button" className={'match-card ' + (selected ? 'selected' : '')} onClick={onClick}>
  <div className="match-card-top"><span><Clock3 size={13}/>{time(game.horario_utc)} · Brasília</span><span className="projection-pill">PROJEÇÃO</span></div>
  <div className="score-row">
   <div className="team-name"><MiniBrand name={game.visitante.sigla}/><div><strong>{game.visitante.sigla}</strong><small>{game.visitante.nome}</small></div></div>
   <strong className="score">{n(prediction.away, 0)}</strong>
  </div>
  <div className="score-row">
   <div className="team-name"><MiniBrand name={game.casa.sigla}/><div><strong>{game.casa.sigla}</strong><small>{game.casa.nome}</small></div></div>
   <strong className="score">{n(prediction.home, 0)}</strong>
  </div>
  <div className="match-bottom"><span>Total previsto <b>{n(prediction.total)}</b></span><span><b>{prediction.favorite}</b> favorito <ArrowRight size={14}/></span></div>
 </button>
}
function Detail({ match }: { match: MatchView }) {
 const { game, prediction: p } = match
 const [expanded, setExpanded] = useState(false)
 useEffect(() => setExpanded(false), [match.key])
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
  <p className="detail-explain">Probabilidades estimadas para o confronto. Ainda não são probabilidades calibradas por backtest.</p>
  <div className="prob-label"><span>{game.visitante.sigla} · {percent(p.awayChance)}</span><span>{game.casa.sigla} · {percent(p.homeChance)}</span></div>
  <div className="prob-track"><div style={{width: percent(p.awayChance)}} /></div>
  <button type="button" className="expand-button" onClick={() => setExpanded(!expanded)}>
   <span><SlidersHorizontal size={16}/> Contexto e desfalques</span><ChevronDown size={16} className={expanded ? 'rotated' : ''}/>
  </button>
  {expanded && <div className="context-panel">
   <div><b>Desfalques confirmados · {game.visitante.sigla}</b>{absentAway.length ?
    <ul>{absentAway.map(x => <li key={x.nome}>{x.nome}</li>)}</ul> : <p>Nenhum registrado nesta coleta</p>}</div>
   <div><b>Desfalques confirmados · {game.casa.sigla}</b>{absentHome.length ?
    <ul>{absentHome.map(x => <li key={x.nome}>{x.nome}</li>)}</ul> : <p>Nenhum registrado nesta coleta</p>}</div>
   <p className="small-note">Situações registradas no arquivo, não confirmadas em tempo real. Ajuste estimado por ausências: {n(p.injuryAway)} visitante · {n(p.injuryHome)} mandante.</p>
  </div>}
 </div>
}
export default function App() {
 const [snapshot, setSnapshot] = useState<DataSnapshot | null>(null)
 const [error, setError] = useState<string | null>(null)
 const [loading, setLoading] = useState(true)
 const [view, setView] = useState<View>('overview')
 const [search, setSearch] = useState('')
 const [selected, setSelected] = useState<string | null>(null)
 const [sidebar, setSidebar] = useState(false)
 const [onlyAbsences, setOnlyAbsences] = useState(false)
 const reload = async () => {
  setLoading(true); setError(null)
  try { setSnapshot(await loadSnapshot()) } catch (e) { setSnapshot(null); setError(e instanceof Error ? e.message : 'Falha inesperada') }
  finally { setLoading(false) }
 }
 useEffect(() => { void reload() }, [])
 const matches = useMemo(() => snapshot?.jogos.map(game => ({
  game,
  prediction: predictGame(game, snapshot.media_liga.ataque, DEFAULT_PARAMS),
  key: [game.horario_utc, game.visitante.sigla, game.casa.sigla].join('|')
 })).sort((a, b) => a.game.horario_utc.localeCompare(b.game.horario_utc)) || [], [snapshot])
 const shown = matches.filter(m => {
  const text = [m.game.casa.nome, m.game.visitante.nome, m.game.casa.sigla, m.game.visitante.sigla].join(' ').toLowerCase()
  if (!text.includes(search.toLowerCase())) return false
  return !onlyAbsences || [...(m.game.casa.ausencias || []), ...(m.game.visitante.ausencias || [])]
   .some(a => a.situacao === 'Fora')
 })
 const selectedMatch = shown.find(m => m.key === selected) || shown[0]
 const stale = !!snapshot && snapshot.data_jogos !== nbaToday()
 const missingInjuryData = !!snapshot && !snapshot.lesoes_ok
 const totalGames = matches.length
 const favoriteHome = matches.filter(m => m.prediction.favorite === m.game.casa.sigla).length
 const highTotal = matches.filter(m => m.prediction.total >= 230).length
 return <div className="app-shell">
  {sidebar && <button className="mobile-backdrop" onClick={() => setSidebar(false)} aria-label="Fechar menu" />}
  <aside className={'sidebar ' + (sidebar ? 'sidebar-open' : '')}>
   <div className="side-logo"><span className="logo-mark"><Activity size={23} strokeWidth={2.5}/></span><div><strong>BSK<span> Analytics</span></strong><small>NBA INTELLIGENCE</small></div><button className="sidebar-close" onClick={() => setSidebar(false)} aria-label="Fechar"><X size={20}/></button></div>
   <div className="side-section-label">WORKSPACE</div>
   <div className="nav-stack">{links.map(l => <button type="button" key={l.view}
    className={'nav-item ' + (view === l.view ? 'nav-active' : '')}
    onClick={() => {setView(l.view);setSidebar(false)}}><l.icon size={18}/>{l.label}{view === l.view && <span className="nav-dot"/>}</button>)}</div>
   <div className="side-section-label tools-label">FERRAMENTAS DO SITE ATUAL</div>
   <div className="nav-stack">{shortcuts.map(l => <a className="nav-item" key={l.label} href={outside(l.file)}><l.icon size={18}/>{l.label}<ArrowUpRight size={14} className="nav-external"/></a>)}</div>
   <div className="side-bottom"><div className="season-block"><div><span className="season-indicator" /> TEMPORADA ATIVA</div><strong>NBA 2026–27</strong><small>Protótipo React · leitura somente</small></div><a className="legacy-link" href={outside('index.html')}><ChevronLeft size={16}/> Voltar ao BSK clássico</a></div>
  </aside>
  <div className="main-column">
   <header className="topbar"><div className="topbar-left"><button className="mobile-menu" onClick={() => setSidebar(true)} aria-label="Abrir menu"><Menu size={21}/></button><span className="breadcrumb">Project BSK</span><ChevronRight size={15}/><strong>{view === 'overview' ? 'Visão geral' : 'Jogos da rodada'}</strong></div><div className="topbar-right"><span className="season-tag">2026–27</span><button type="button" className="refresh-btn" onClick={() => void reload()} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''}/> <span>Atualizar</span></button></div></header>
   <main className="content">
    <div className="page-heading"><div><span className="eyebrow"><span className="tiny-green" /> PAINEL DE ANÁLISE · BETA</span><h1>{view === 'overview' ? 'Panorama da rodada' : 'Jogos e projeções'}</h1><p>Projeções baseadas nos dados da temporada 2026–27. Sem odds, sem cálculos financeiros.</p></div><span className="heading-icon"><Activity size={26}/></span></div>
    {error && <section className="notice error-notice"><CircleAlert size={20}/><div><b>Dados indisponíveis</b><p>{error}</p><small>O protótipo não substitui dados ausentes por valores fictícios.</small></div></section>}
    {loading && <section className="loading-card"><RefreshCw className="spin" size={24}/><p>Carregando dados e calculando projeções…</p></section>}
    {snapshot && <>
     {(stale || missingInjuryData) && <section className="notice caution"><CircleAlert size={19}/><div><b>{stale ? 'Arquivo de outra rodada' : 'Verificação de lesões indisponível'}</b><p>{stale ? 'A coleta disponível é de ' + date(snapshot.data_jogos) + '. Estes números são uma visualização do snapshot, não previsões atualizadas para hoje.' : 'Desfalques podem estar incompletos. Confira antes de usar estas projeções.'}</p></div></section>}
     <div className="snapshot-line"><span><Database size={15}/> Base: {date(snapshot.data_jogos)}</span><span><Clock3 size={15}/> Coleta: {snapshot.atualizado_em.replace('T', ' ')}</span><span><ShieldCheck size={15}/> Fonte: dados.js existente</span></div>
     {view === 'overview' && <>
      <div className="stats-grid">
       <StatTile label="Partidas na coleta" value={String(totalGames)} note="Snapshot da rodada" icon={CalendarDays}/>
       <StatTile label="Favoritos mandantes" value={String(favoriteHome)} note="Projeções do modelo" icon={TrendingUp}/>
       <StatTile label="Totais ≥ 230" value={String(highTotal)} note="Estimativa de pontos" icon={BarChart3}/>
       <StatTile label="Status dos dados" value={stale ? 'Antigos' : 'Atuais'} note={stale ? 'Atualizar gerador Python' : 'Data NBA verificada'} icon={Database}/>
      </div>
      <div className="section-head"><div><span className="eyebrow">VISÃO GERAL</span><h2>Confrontos da coleta</h2><p>Selecione um jogo para explorar a projeção e o contexto.</p></div><button type="button" className="text-link" onClick={() => setView('games')}>Ver todos <ArrowRight size={16}/></button></div>
     </>}
     {view === 'games' && <div className="section-head"><div><span className="eyebrow">TODOS OS CONFRONTOS</span><h2>Jogos da rodada</h2><p>Resultados do modelo preservados sem odds.</p></div><span className="count-label">{shown.length} partidas</span></div>}
     <div className="game-toolbar"><div className="search-box"><Search size={18}/><input aria-label="Buscar equipe" placeholder="Buscar equipe ou sigla…" value={search} onChange={e => setSearch(e.target.value)}/>{search && <button onClick={() => setSearch('')} aria-label="Limpar busca"><X size={16}/></button>}</div><label className="checkbox-filter"><input type="checkbox" checked={onlyAbsences} onChange={e => setOnlyAbsences(e.target.checked)}/> Com desfalques confirmados</label></div>
     {shown.length ? <div className="workspace-grid"><div className="matches-column">{shown.map(m => <MatchCard key={m.key} match={m} selected={selectedMatch?.key === m.key} onClick={() => setSelected(m.key)}/>)}</div><aside className="detail-panel" key={selectedMatch?.key}><Detail match={selectedMatch}/></aside></div> :
      <div className="empty-state"><Search size={25}/><strong>Nenhum confronto encontrado</strong><span>Altere a busca ou remova os filtros.</span></div>}
     <div className="methodology"><Sparkles size={18}/><div><strong>Sobre as projeções</strong><p>Os cálculos de pontos, total, favorito e contexto são uma porta da função <code>analisar()</code> do BSK clássico, com parâmetros padrão. Esta fase não altera o motor Python, os snapshots de histórico ou os ajustes manuais do site atual. A equivalência numérica é verificada automaticamente no pipeline.</p></div></div>
    </>}
    <footer className="footer"><span>© Project BSK · Protótipo React/TypeScript</span><span>Dados NBA 2026–27 · Sem odds</span></footer>
   </main>
  </div>
 </div>
}
