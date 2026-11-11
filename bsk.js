const $ = id => document.getElementById(id);
const num = id => { const v = parseFloat($(id).value); return isNaN(v) ? 0 : v; };
const f1 = x => x.toFixed(1).replace(".", ",");
const pct = x => (x * 100).toFixed(1).replace(".", ",") + "%";
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

function erf(x){const s=x<0?-1:1;x=Math.abs(x);const t=1/(1+0.3275911*x);
  const y=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-x*x);return s*y;}
const cdf = z => 0.5 * (1 + erf(z / Math.SQRT2));

function taxaRecente(t){ const n = Math.min(t.jogos, 10); return n > 0 ? t.vitorias_ultimos_10 / n : 0.5; }

// Com poucos jogos, aproxima o rating da média da liga (evita exagero no começo da temporada)
function encolher(rating, jogos, lg){ const K = num("K"); return K > 0 ? lg + (rating - lg) * jogos / (jogos + K) : rating; }

const PESO_SITUACAO = {"Fora": 1, "Provável ausência": 0.75, "Dúvida": 0.25};

// Pontos de margem perdidos pelo time com as ausências. Quem já faltou à maior parte dos jogos
// pesa menos, porque os ratings do time já refletem essa falta.
function impactoAusencias(t){
  const k = num("kInj");
  if (k <= 0) return 0;
  let total = 0;
  (t.ausencias || []).forEach(a => {
    if (!a.jogos || a.minutos < 15 || !t.jogos) return;
    const producao = a.pts + a.reb + a.ast;
    total += (PESO_SITUACAO[a.situacao] || 0) * Math.max(0, producao - 15) * k * Math.min(1, a.jogos / t.jogos);
  });
  return Math.min(total, 8);
}

function analisar(j, lg){
  const c = j.casa, v = j.visitante;
  const posse = (c.ritmo + v.ritmo) / 2;
  const ac = encolher(c.ataque, c.jogos, lg.ataque), dc = encolher(c.defesa, c.jogos, lg.ataque);
  const av = encolher(v.ataque, v.jogos, lg.ataque), dv = encolher(v.defesa, v.jogos, lg.ataque);
  let sc = (ac + dv - lg.ataque) * posse / 100;
  let sv = (av + dc - lg.ataque) * posse / 100;
  const impC = impactoAusencias(c), impV = impactoAusencias(v);
  const ajuste = num("wHome") + num("wForm") * (taxaRecente(c) - taxaRecente(v)) + (impV - impC);
  sc += ajuste / 2; sv -= ajuste / 2;
  const margem = sc - sv;
  const pc = cdf(margem / Math.max(num("sd"), 1));
  return {j, sc, sv, margem, pc, pv: 1 - pc, impC, impV, fav: pc >= 0.5 ? c : v, pf: Math.max(pc, 1 - pc)};
}

function hora(iso){ try { return new Date(iso).toLocaleTimeString("pt-BR", {hour: "2-digit", minute: "2-digit"}); } catch (e) { return ""; } }

function tag(s){
  if (!s || s === "Disponível") return '<span class="msg">Disponível</span>';
  return '<span class="tg ' + (s === "Fora" ? "t-out" : "t-q") + '">' + esc(s) + '</span>';
}

function dataCurta(iso){ return iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) : "-"; }

const PAGINA = document.body.dataset.page || "jogos";
const ROTULO = {pts: "pontos", reb: "rebotes", ast: "assistências", tres: "bolas de 3"};
const NIVEL_TXT = {forte: "mais fortes", media: "do mesmo nível", fraca: "mais fracos"};
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const LINHAS = {};
const STATUS_MANUAIS = ["Não verificado","Titular confirmado","Disponível confirmado","Provável","Questionável","Improvável","Fora"];
const STATUS_KEY = "bsk-escalações-v1";
let STATUS_SALVOS = {};
try { const raw=JSON.parse(localStorage.getItem(STATUS_KEY)||"{}"); if(raw && typeof raw==="object" && !Array.isArray(raw)) STATUS_SALVOS=raw; } catch(e) {}
function chaveEscalacao(t,p){
  return (typeof DADOS==="undefined"?"":DADOS.data_jogos)+"|"+t.sigla+"|"+p.nome;
}

const STATUS_AUTOMATICOS = new Map();
const LESOES_AO_VIVO = new Map();
let statusColetaAutomatica="Aguardando consulta ao feed NBA";
let escalacaoConsultando=false;
function automatico(t,p){
  const aoVivo=STATUS_AUTOMATICOS.get(chaveEscalacao(t,p));
  if(aoVivo)return {valor:aoVivo,origem:"NBA · box score"};
  const lesao=LESOES_AO_VIVO.get(chaveEscalacao(t,p));
  if(lesao)return {valor:lesao,origem:"ESPN · consulta de lesões recente"};
  const situacao=p.situacao||"Desconhecido";
  // 'Disponível' vem da ausência de alertas no boletim de lesões, não prova escalação.
  if(situacao==="Disponível")return {valor:"Sem confirmação de titularidade",origem:"ESPN · sem alerta de lesão na coleta"};
  return {valor:situacao,origem:"ESPN · boletim de lesões da última coleta"};
}
function statusManual(t,p){
  return STATUS_MANUAIS.includes(STATUS_SALVOS[chaveEscalacao(t,p)])?STATUS_SALVOS[chaveEscalacao(t,p)]:"Não verificado";
}
function statusInfo(t,p){
  const manual=statusManual(t,p);
  return manual!=="Não verificado"?{valor:manual,origem:"Ajuste manual"}:automatico(t,p);
}
function statusEfetivo(t,p){return statusInfo(t,p).valor;}
function jogadorIndisponivel(t,p){
  return ["Fora","Improvável","Provável ausência"].includes(statusEfetivo(t,p));
}
function centralEscalacoes(lista){
  const times=new Map();
  lista.forEach(r=>[r.j.visitante,r.j.casa].forEach(t=>times.set(t.sigla,t)));
  const todos=Array.from(times.values());
  const verificados=todos.reduce((n,t)=>n+(t.jogadores||[]).filter(p=>STATUS_AUTOMATICOS.has(chaveEscalacao(t,p))).length,0);
  const manuais=todos.reduce((n,t)=>n+(t.jogadores||[]).filter(p=>statusManual(t,p)!=="Não verificado").length,0);
  const texto='<div class="central-top"><div><p class="eyebrow">Fonte automática · ajustes opcionais</p><h2>Central de escalações</h2><p class="sub">O BSK identifica lesões no snapshot ESPN e tenta confirmar titulares pela NBA quando o box score estiver disponível. Você só precisa alterar manualmente se quiser corrigir algum status.</p></div><span class="central-count">'+verificados+' NBA · '+manuais+' manuais</span></div>';
  const equipes=todos.map(t=>{
    const jogadores=(t.jogadores||[]).map(p=>{
      const escolhido=statusManual(t,p),inf=statusInfo(t,p);
      const opcoes=STATUS_MANUAIS.map(v=>'<option value="'+esc(v)+'"'+(v===escolhido?' selected':'')+'>'+(v==="Não verificado"?"Automático (padrão)":esc(v))+'</option>').join("");
      return '<div class="central-row"><div class="central-player"><b>'+esc(p.nome)+'</b><small><strong>'+esc(inf.valor)+'</strong> · '+esc(inf.origem)+'</small></div><details class="override"><summary>Corrigir</summary><select aria-label="Correção do status de '+esc(p.nome)+'" data-status-player="'+esc(chaveEscalacao(t,p))+'">'+opcoes+'</select></details></div>';
    }).join("");
    return '<div class="central-team"><h3>'+esc(t.nome)+'</h3>'+(jogadores||'<p class="sub">Sem atletas neste resumo.</p>')+'</div>';
  }).join("");
  return '<section class="sec" data-id="central"><div class="sb" style="padding-top:18px">'+texto+
    '<div class="central-tools" style="margin-top:12px"><button type="button" data-auto-refresh>Atualizar NBA agora</button><button type="button" data-limpar-status>Limpar correções manuais</button></div>'+
    '<p class="central-info" id="auto-status">'+esc(statusColetaAutomatica)+'</p>'+
    '<div class="central-grid">'+equipes+'</div><p class="central-info">A lista contém somente os jogadores já incluídos nos dados do BSK — não o elenco completo. Antes do jogo, falta de alerta de lesão não significa titular confirmado. O feed NBA pode ser bloqueado no navegador; nesse caso, continua visível a última coleta ESPN. Nenhum ajuste de minutos é inferido automaticamente.</p></div></section>';
}
function salvarStatus(key,value){
  if(!STATUS_MANUAIS.includes(value))return;
  if(value==="Não verificado")delete STATUS_SALVOS[key];
  else STATUS_SALVOS[key]=value;
  try{localStorage.setItem(STATUS_KEY,JSON.stringify(STATUS_SALVOS));}catch(e){}
}

const MIN_MEDIA = {pts: 8, reb: 3.5, ast: 2.5, tres: 1.5};  // ignora estatísticas de baixo volume

function desvioPrior(chave, m){
  return chave === "pts" ? 0.3 * m + 1.2 : chave === "reb" ? 0.36 * m + 0.5 :
         chave === "ast" ? 0.45 * m + 0.5 : Math.sqrt(Math.max(m, 0)) + 0.2;
}

// Aumento de bola para os principais jogadores quando companheiros importantes estão fora
function bumpsTime(t){
  let pts = 0, ast = 0;
  (t.ausencias || []).forEach(a => {
    if (!a.jogos || a.minutos < 15 || !t.jogos) return;
    const w = (PESO_SITUACAO[a.situacao] || 0) * Math.min(1, a.jogos / t.jogos);
    pts += w * a.pts * 0.15; ast += w * a.ast * 0.10;
  });
  return {pts: Math.min(pts, 3), ast: Math.min(ast, 1.5)};
}

function projetar(chave, d, t, o, r, ehCasa, bump){
  const wRec = 0; // backtest inicial: média da temporada teve menor MAE nas quatro categorias; peso recente 0 permanece provisório.
  const base = d.media * (1 - wRec) + d.ultimos5 * wRec;
  const projTime = ehCasa ? r.sc : r.sv;
  const fPts = clamp(projTime / (t.ataque * t.ritmo / 100), 0.85, 1.15);
  const fRit = clamp(((t.ritmo + o.ritmo) / 2) / t.ritmo, 0.9, 1.1);
  const fator = chave === "pts" ? fPts : chave === "reb" ? fRit : Math.pow(fPts, 0.5);
  const favorito = ehCasa ? r.margem > 0 : r.margem < 0;
  const fMin = favorito ? 1 - clamp((Math.abs(r.margem) - 10) / 10, 0, 1) * 0.08 : 1;  // jogo decidido: menos minutos
  const modelo = base * fator * fMin + bump;
  const nv = d.por_nivel ? d.por_nivel[o.nivel] : null;
  const temNv = nv && nv.media != null;
  const wN = temNv ? Math.min(0.4, nv.jogos / (nv.jogos + 6)) : 0;
  const proj = temNv ? modelo * (1 - wN) + (nv.media * fMin + bump) * wN : modelo;
  const prior = desvioPrior(chave, base);
  const sd = d.desvio == null ? prior : (d.jogos * d.desvio + 6 * prior) / (d.jogos + 6);
  const ref = Math.floor(0.7 * d.media + 0.3 * d.ultimos5 + 1e-9) + 0.5;  // linha sintética de referência; NÃO representa cotação de bookmaker
  return {proj, sd: Math.max(sd, 0.5), ref, nv: temNv ? nv : null, bump, fMin, favorito};
}

function elegibilidade(q){
  const alertas=[];
  const situacao=statusEfetivo(q.t,q.p);
  if(situacao==="Sem confirmação de titularidade") alertas.push("Titularidade pendente; sem alerta de lesão na última coleta");
  if(!["Sem confirmação de titularidade","Disponível","Titular confirmado","Disponível confirmado","Banco confirmado"].includes(situacao)) alertas.push("Situação do jogador: "+situacao);
  if(q.d.jogos < 8) alertas.push("Amostra pequena (" + q.d.jogos + " jogos)");
  if(q.d.jogos >= 8 && q.d.jogos < 12) alertas.push("Histórico ainda curto");
  if(q.r.j.casa.ausencias == null || q.r.j.visitante.ausencias == null) alertas.push("Desfalques não verificados");
  if(typeof DADOS !== "undefined" && !DADOS.lesoes_ok) alertas.push("Atualização de lesões indisponível");
  if(q.bump > 0.3) alertas.push("Projeção depende de ajuste por desfalques");
  if(q.favorito && Math.abs(q.r.margem) >= 12) alertas.push("Possível redução de minutos");
  if(q.nv && q.nv.jogos < 4) alertas.push("Comparação por nível com poucos jogos");
  return alertas;
}
function pontuar(q){
  const risco=elegibilidade(q);
  const amostra=Math.min(1,q.d.jogos/15);
  // Escore de PRIORIZAÇÃO, não probabilidade de acerto. Sem linhas reais e calibração não há "certeza".
  const sinal=Math.abs(q.proj-q.ref)/Math.max(q.sd,0.75);
  const penalidade=risco.length*0.22;
  return {risco,score:sinal*amostra-penalidade,apta:risco.length===0 && q.d.jogos>=12 && sinal>=0.35};
}
function opcoesDoJogo(r){
  const todas=[];
  [[r.j.casa,r.j.visitante,true],[r.j.visitante,r.j.casa,false]].forEach(([t,o,ehCasa])=>{
    const bumps=bumpsTime(t);
    const top3=(t.jogadores||[]).slice().sort((a,b)=>b.pts-a.pts).slice(0,3).map(p=>p.nome);
    (t.jogadores||[]).forEach(p=>{
      if(!p.props || jogadorIndisponivel(t,p)) return;
      ["pts","reb","ast","tres"].forEach(chave=>{
        const d=p.props[chave];
        if(!d || d.jogos<5 || d.media<MIN_MEDIA[chave]) return;
        const bump=top3.includes(p.nome)?(chave==="pts"?bumps.pts:chave==="ast"?bumps.ast:0):0;
        const x=projetar(chave,d,t,o,r,ehCasa,bump);
        const forca=(x.proj-x.ref)/x.sd;
        const q=Object.assign({r,t,o,p,d,chave,forca,dir:forca>=0?"Over":"Under"},x);
        Object.assign(q,pontuar(q));todas.push(q);
      });
    });
  });
  const melhor={};
  todas.forEach(q=>{
    const key=q.t.sigla+"|"+q.p.nome;
    if(!melhor[key] || q.score>melhor[key].score) melhor[key]=q;
  });
  return Object.values(melhor).filter(q=>Math.abs(q.forca)>=0.2).sort((a,b)=>b.score-a.score);
}

function motivo(x){
  const t = x.t, o = x.o, r = x.r, d = x.d, partes = [];
  const projTime = t === r.j.casa ? r.sc : r.sv;
  partes.push(t.sigla + (x.favorito ? " favorito por " : " azarão por ") + f1(Math.abs(r.margem)) +
    " pts, projetado para " + Math.round(projTime) + " pontos (média " + Math.round(t.ataque * t.ritmo / 100) + ")");
  if (x.nv) partes.push("contra times " + NIVEL_TXT[o.nivel] + ": " + f1(x.nv.media) + " " + ROTULO[x.chave] + " em " + x.nv.jogos + (x.nv.jogos === 1 ? " jogo" : " jogos"));
  if (Math.abs(d.ultimos5 - d.media) >= Math.max(1, d.media * 0.1)) partes.push("últimos 5 jogos: " + f1(d.ultimos5) + " (média " + f1(d.media) + ")");
  const tx = taxaRecente(t), n = Math.min(t.jogos, 10);
  if (tx >= 0.7) partes.push(t.sigla + " em boa fase (" + t.vitorias_ultimos_10 + "-" + (n - t.vitorias_ultimos_10) + " nos últimos " + n + ")");
  else if (tx <= 0.3) partes.push(t.sigla + " em má fase (" + t.vitorias_ultimos_10 + "-" + (n - t.vitorias_ultimos_10) + " nos últimos " + n + ")");
  if (x.bump > 0.3) partes.push("mais bola com desfalques no elenco");
  if (x.favorito && Math.abs(r.margem) >= 12) partes.push("risco de minutos reduzidos se o jogo ficar decidido");
  return partes.join(" · ");
}

function avaliarLinhaReal(projecao, desvio, linha, riscos, jogos) {
  // Classificação estatística exploratória; NÃO é probabilidade de acerto nem EV.
  if (!Number.isFinite(linha) || linha < 0) {
    return {status:"negative", texto:"Digite uma linha válida (zero ou maior)."};
  }
  const diferenca = projecao - linha;
  const lado = diferenca >= 0 ? "Over" : "Under";
  const distancia = Math.abs(diferenca);
  const padronizada = distancia / Math.max(desvio, 0.75);
  if (riscos.length || jogos < 12) {
    return {status:"negative", texto:lado+" "+f1(linha)+" · diferença de "+f1(distancia)+". Em observação: "+(riscos.join("; ") || "amostra curta")+". Não selecionar sem revisão."};
  }
  if (padronizada < 0.5) {
    return {status:"negative", texto:"Sem diferença estatística suficiente para a linha "+f1(linha)+" (distância "+f1(distancia)+"). Melhor passar."};
  }
  return {status:"positive", texto:lado+" "+f1(linha)+" · distância "+f1(distancia)+" ("+f1(padronizada)+" desvios estimados). Candidato à revisão de odds, lesões e minutos — não é uma aposta garantida."};
}
function pickHtml(x,prefixo){
  const id=x.t.sigla+"|"+x.p.nome+"|"+x.chave+"|"+x.r.j.horario_utc;
  const uid=prefixo+"-"+id.replace(/[^a-zA-Z0-9]/g,"-");
  const status=x.apta?"Passou na triagem inicial":"Em observação";
  const risco=x.risco.length?x.risco.join(" · "):"Sem alertas automáticos. Confira escalação, minutos e odds.";
  return '<article class="pick'+(x.apta?' featured':'')+'"><div class="pick-top"><span class="pick-type">'+esc(ROTULO[x.chave])+'</span><span class="dir '+(x.dir==="Over"?"ov":"un")+'">'+x.dir+' estimado</span></div>'+
    '<h3>'+esc(x.p.nome)+'</h3><p class="match">'+esc(x.t.sigla)+' × '+esc(x.o.sigla)+' · '+hora(x.r.j.horario_utc)+'</p>'+
    '<div class="pick-stats"><div class="pick-stat"><strong>'+f1(x.proj)+'</strong><span>Projeção do modelo</span></div><div class="pick-stat"><strong>'+f1(x.ref)+'</strong><span>Linha sintética · não é cotação real</span></div></div>'+
    '<div class="quick-facts"><span>'+x.d.jogos+' jogos</span><span>Média '+f1(x.d.media)+'</span><span>Últ. 5 '+f1(x.d.ultimos5)+'</span></div>'+
    '<div class="live-stat" data-live-player="'+esc(x.p.nome)+'" data-live-team="'+esc(x.t.sigla)+'" data-live-stat="'+esc(x.chave)+'"></div>'+
    '<div class="quality'+(x.apta?'':' warn')+'">'+esc(status)+'</div>'+
    '<p class="reason">'+esc(risco)+'</p>'+
    '<div class="lin"><label for="'+esc(uid)+'">Linha real da casa</label><input id="'+esc(uid)+'" aria-label="Linha real para '+esc(x.p.nome)+'" data-k="'+esc(id)+'" data-proj="'+x.proj+'" data-sd="'+x.sd+'" data-riscos="'+esc(JSON.stringify(x.risco))+'" data-jogos="'+x.d.jogos+'" type="number" min="0" step="0.5" placeholder="Ex.: 22.5" value="'+esc(LINHAS[id]==null?"":LINHAS[id])+'"><span class="res" role="status" aria-live="polite"></span></div>'+
    '<details><summary>Justificativa e limitações</summary><p>'+esc(motivo(x))+'</p><p>Este é um filtro exploratório, sem probabilidade calibrada ou análise de valor esperado com odds reais. O ranking usa uma linha de referência sintética.</p></details></article>';
}
function atualizarLinha(el){
  const alvo=el.parentElement.querySelector(".res");
  if(!el.value.trim()){alvo.textContent="";alvo.removeAttribute("data-status");return;}
  let riscos=[];
  try{riscos=JSON.parse(el.dataset.riscos||"[]");}catch(e){riscos=["Falha ao ler alertas"];}
  const resultado=avaliarLinhaReal(Number(el.dataset.proj),Number(el.dataset.sd),Number(el.value),riscos,Number(el.dataset.jogos));
  alvo.textContent=resultado.texto;
  alvo.dataset.status=resultado.status;
}


const NIVEL_NOME = {forte: "Forte", media: "Médio", fraca: "Fraco"};
const estado = {jogo: 0, aba: "resumo", abertos: {}};
let LISTA = [];

function aberta(id, padrao){ return id in estado.abertos ? estado.abertos[id] : padrao; }

function secao(id, titulo, corpo, padrao){
  const ab = aberta(id, padrao !== false);
  return '<section class="sec' + (ab ? "" : " fechada") + '" data-id="' + esc(id) + '"><button type="button" class="sh" aria-expanded="' + ab +
    '"><span class="chev">▾</span><span>' + titulo + '</span></button><div class="sb">' + corpo + '</div></section>';
}

function seta(ult, media){
  if (ult == null) return "";
  const d = ult - media;
  return d >= 2 ? " ▲" : d <= -2 ? " ▼" : "";
}

function tabelaAusencias(t){
  const linhas = (t.ausencias || []).map(a =>
    '<tr><td title="' + esc(a.comentario || "") + '">' + esc(a.nome) + '</td><td class="l">' + tag(a.situacao) +
    '</td><td class="l">' + esc(a.motivo || "-") + '</td><td>' + esc(a.retorno || "-") +
    '</td><td>' + (a.minutos >= 15 ? f1(a.pts) + "/" + f1(a.reb) + "/" + f1(a.ast) : "-") +
    '</td><td>' + dataCurta(a.atualizado) + '</td></tr>').join("");
  return '<div class="wrap"><table class="pl"><thead><tr><th>Jogador</th><th class="l">Situação</th><th class="l">Motivo</th>' +
    '<th>Retorno previsto</th><th>PTS/REB/AST</th><th>Notícia</th></tr></thead><tbody>' + linhas + '</tbody></table></div>';
}

function tabelaJogadores(t){
  const linhas = (t.jogadores || []).map(p =>
    '<tr><td>' + esc(p.nome) + '</td><td>' + p.jogos + '/' + t.jogos + '</td><td>' + f1(p.minutos) + '</td><td>' + f1(p.pts) +
    '</td><td>' + f1(p.reb) + '</td><td>' + f1(p.ast) + '</td><td>' + f1(p.stl) + '</td><td>' + f1(p.blk) +
    '</td><td>' + f1(p.fg) + '</td><td>' + f1(p.tres) + '</td><td>' + (p.pts_5 == null ? "-" : f1(p.pts_5) + seta(p.pts_5, p.pts)) +
    '</td><td class="l">' + tag(p.situacao) + '</td></tr>').join("");
  return '<div class="wrap"><table class="pl"><thead><tr><th>Jogador</th><th>Jogos</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>ROU</th><th>TOC</th><th>FG%</th><th>3P%</th><th>PTS últ. 5</th><th class="l">Situação</th></tr></thead>' +
    '<tbody>' + linhas + '</tbody></table></div>';
}

const tile = (valor, rotulo) => '<div><b>' + valor + '</b><span>' + rotulo + '</span></div>';
const picksHtml = (lista, prefixo, vazio) => lista.length ? '<div class="picks-grid">' + lista.map(x => pickHtml(x, prefixo)).join("") + '</div>' : '<p class="msg">' + vazio + '</p>';

function abaResumo(r, i){
  const c = r.j.casa, v = r.j.visitante, p = "j" + i + "-r-";
  const tiles = '<div class="nums">' + tile(Math.round(r.sv) + " x " + Math.round(r.sc), "Placar projetado (visitante x casa)") +
    tile(f1(r.sv + r.sc), "Total de pontos projetado") + tile(f1(Math.abs(r.margem)), "Margem esperada") + '</div>';
  const lin = (rot, a, b) => '<tr><td>' + rot + '</td><td>' + a + '</td><td>' + b + '</td></tr>';
  const ult = t => t.vitorias_ultimos_10 + " em " + Math.min(t.jogos, 10);
  const imp = x => x > 0.05 ? "-" + f1(x) + " pts" : "nenhum";
  const comp = '<div class="wrap"><table class="pl"><thead><tr><th></th><th>' + esc(v.sigla) + '</th><th>' + esc(c.sigla) + '</th></tr></thead><tbody>' +
    lin("Campanha", v.vitorias + "-" + v.derrotas, c.vitorias + "-" + c.derrotas) +
    lin("Vitórias nos últimos jogos", ult(v), ult(c)) +
    lin("Ataque", f1(v.ataque), f1(c.ataque)) + lin("Defesa", f1(v.defesa), f1(c.defesa)) + lin("Ritmo", f1(v.ritmo), f1(c.ritmo)) +
    lin("Nível do time", NIVEL_NOME[v.nivel] || "-", NIVEL_NOME[c.nivel] || "-") +
    lin("Impacto das ausências", imp(r.impV), imp(r.impC)) + '</tbody></table></div>';
  return tiles + secao(p + "comp", "Comparativo dos times", comp) +
    secao(p + "op", "Candidatos do radar neste jogo", picksHtml(opcoesDoJogo(r).slice(0, 4), "j", "Sem candidatos suficientes neste jogo."));
}

function abaTime(r, i, ehCasa){
  const t = ehCasa ? r.j.casa : r.j.visitante, o = ehCasa ? r.j.visitante : r.j.casa;
  const imp = ehCasa ? r.impC : r.impV, prob = ehCasa ? r.pc : r.pv, proj = ehCasa ? r.sc : r.sv;
  const p = "j" + i + (ehCasa ? "-c-" : "-v-");
  const tiles = '<div class="nums">' + tile(pct(prob), "Chance de vitória") + tile(Math.round(proj), "Pontos projetados") +
    tile(t.vitorias + "-" + t.derrotas, "Campanha") + tile(t.vitorias_ultimos_10 + " em " + Math.min(t.jogos, 10), "Vitórias nos últimos jogos") +
    tile(f1(t.ataque) + " / " + f1(t.defesa), "Ataque / defesa") + tile(NIVEL_NOME[t.nivel] || "-", "Nível do time") +
    (imp > 0.05 ? tile("-" + f1(imp) + " pts", "Impacto das ausências") : "") + '</div>';
  const ops = opcoesDoJogo(r).filter(x => x.t === t).slice(0, 5);
  let html = tiles + secao(p + "op", "Melhores opções de jogadores: " + esc(t.sigla), picksHtml(ops, "t", "Sem opções com vantagem clara para este time."));
  if ((t.ausencias || []).length) html += secao(p + "au", "Ausências e dúvidas" + (imp > 0.05 ? " (impacto estimado: -" + f1(imp) + " pts)" : ""), tabelaAusencias(t));
  if ((t.jogadores || []).length) html += secao(p + "jg", "Estatísticas dos jogadores", tabelaJogadores(t), false);
  return html;
}

function painelJogo(r, i){
  const c = r.j.casa, v = r.j.visitante;
  const verd = r.pf < 0.55 ? "Jogo equilibrado." : "Favorito: <b>" + esc(r.fav.nome) + "</b>, com margem de " + f1(Math.abs(r.margem)) + " pts.";
  const cab = '<div class="gh"><div class="vs"><span class="pv">' + esc(v.sigla) + ' ' + pct(r.pv) + '</span><span class="pc">' + pct(r.pc) + ' ' + esc(c.sigla) + '</span></div>' +
    '<div class="bar"><i style="width:' + (r.pv * 100) + '%;background:var(--b)"></i><i style="width:' + (r.pc * 100) + '%;background:var(--a)"></i></div>' +
    '<p class="verd">' + esc(v.nome) + ' (visitante) x ' + esc(c.nome) + ' (casa). ' + verd + '</p></div>';
  const abas = [["resumo", "Resumo", "r"], ["vis", v.sigla, "v"], ["casa", c.sigla, "c"]];
  const nav = '<div class="abas" role="tablist">' + abas.map(a =>
    '<button type="button" role="tab" class="ab ' + a[2] + (estado.aba === a[0] ? " on" : "") + '" aria-selected="' + (estado.aba === a[0]) + '" data-aba="' + a[0] + '">' + esc(a[1]) + '</button>').join("") + '</div>';
  const corpo = estado.aba === "casa" ? abaTime(r, i, true) : estado.aba === "vis" ? abaTime(r, i, false) : abaResumo(r, i);
  return cab + nav + corpo;
}

function destaques(lista){
  const todas=lista.flatMap(r=>opcoesDoJogo(r)).sort((a,b)=>b.score-a.score);
  const aptas=todas.filter(x=>x.apta && x.score>0).slice(0,6);
  const observacao=todas.filter(x=>!x.apta && x.score>0).slice(0,5);
  const cab='<div class="spotlight-head"><div><p class="eyebrow">Seleção criteriosa</p><h2>Radar · Melhores do dia</h2></div><p>'+aptas.length+' pré-seleções · '+observacao.length+' em observação</p></div>';
  const aviso='<div class="notice"><strong>Importante:</strong> nenhuma seleção é garantida. A posição no radar é um escore heurístico de prioridade, NÃO uma probabilidade calibrada. As linhas exibidas são estimadas, não linhas reais de casas de apostas. Informe a linha real para uma avaliação preliminar; para qualquer decisão, verifique também odds, disponibilidade e minutos previstos. O backtest atual mede erro da projeção simplificada, não taxa de acerto nem ROI deste ranking.</div>';
  const principais=aptas.length?'<div class="picks-grid">'+aptas.map(x=>pickHtml(x,"g")).join("")+'</div>':'<div class="empty">Nenhuma pré-seleção passou por todos os filtros de risco e amostra nesta coleta. Confira os candidatos em observação abaixo; isso não significa que os jogos estejam sem oportunidades.</div>';
  const listaMotivos=[...new Set(todas.flatMap(x=>x.risco))].slice(0,5);
  const motivos=aptas.length?"":'<p class="note" style="margin:10px 0 17px"><strong>Principais impedimentos identificados:</strong> '+(listaMotivos.length?listaMotivos.map(esc).join(" · "):"Amostra curta ou sinal insuficiente em relação à referência sintética")+'</p>';
  const vigiar=observacao.length?'<section style="margin-top:25px"><div class="spotlight-head"><h2>Em observação</h2><p>Dados insuficientes ou alertas ativos</p></div><div class="picks-grid">'+observacao.map(x=>pickHtml(x,"g")).join("")+'</div></section>':'';
  return cab+principais+motivos+vigiar+aviso;
}

function renderJogos(){
  $("jogos").innerHTML = LISTA.map((r, i) =>
    '<button type="button" role="tab" class="gt' + (i === estado.jogo ? " on" : "") + '" aria-selected="' + (i === estado.jogo) + '" data-jogo="' + i + '"><span>' +
    esc(r.j.visitante.sigla) + ' @ ' + esc(r.j.casa.sigla) + '</span><small>' + hora(r.j.horario_utc) + '</small></button>').join("");
  $("painel").innerHTML = painelJogo(LISTA[estado.jogo], estado.jogo);
  document.querySelectorAll("input[data-k]").forEach(el => { if (el.value) atualizarLinha(el); });
}

function render(){
  if (typeof DADOS === "undefined") {
    const destino=$("painel")||$("dest")||$("central");
    destino.innerHTML='<p class="msg">dados.js não encontrado. Execute python gerar_dados.py e atualize os arquivos publicados.</p>';
    return;
  }
  $("sub").textContent = "Jogos de " + DADOS.data_jogos + " · dados atualizados em " + DADOS.atualizado_em.replace("T", " ") + (DADOS.lesoes_ok ? "" : " · sem dados de lesões");
  if (!DADOS.jogos.length) { const destino=$("painel")||$("dest")||$("central"); destino.innerHTML='<p class="msg">Nenhum jogo encontrado nesta coleta.</p>'; return; }
  LISTA = DADOS.jogos.map(j => analisar(j, DADOS.media_liga)).sort((a, b) => a.j.horario_utc < b.j.horario_utc ? -1 : a.j.horario_utc > b.j.horario_utc ? 1 : 0);
  if (estado.jogo >= LISTA.length) estado.jogo = 0;
  if(PAGINA==="jogos") renderJogos();
  if(PAGINA==="melhores") {
    $("dest").innerHTML=destaques(LISTA);
    atualizarAoVivo();
  }
  if(PAGINA==="escalacoes") $("central").innerHTML=centralEscalacoes(LISTA);
}

document.addEventListener("click", e => {
  const alvo = e.target && e.target.closest ? e.target : null;
  if (!alvo) return;
  const limpar=alvo.closest("[data-limpar-status]");
  if(limpar){
    const data=DADOS.data_jogos+"|";
    Object.keys(STATUS_SALVOS).filter(k=>k.startsWith(data)).forEach(k=>delete STATUS_SALVOS[k]);
    try{localStorage.setItem(STATUS_KEY,JSON.stringify(STATUS_SALVOS));}catch(e){}
    render();return;
  }
  const sh = alvo.closest(".sh");
  if (sh) {
    const sec = sh.parentElement, fechada = sec.classList.toggle("fechada");
    sh.setAttribute("aria-expanded", String(!fechada));
    estado.abertos[sec.dataset.id] = !fechada;
    return;
  }
  const jt = alvo.closest("[data-jogo]");
  if (jt && PAGINA==="jogos") { estado.jogo = Number(jt.dataset.jogo); estado.aba = "resumo"; renderJogos(); return; }
  const at = alvo.closest("[data-aba]");
  if (at && PAGINA==="jogos") { estado.aba = at.dataset.aba; renderJogos(); return; }
  const auto=alvo.closest("[data-auto-refresh]"); if(auto){atualizarEscalacoesAuto();return;}
  const atualizar=alvo.closest("[data-live-refresh]"); if(atualizar){atualizarAoVivo();return;}
  const tudo = alvo.closest("[data-tudo]");
  if (tudo) {
    const abrir = tudo.dataset.tudo === "abrir";
    document.querySelectorAll(".sec").forEach(sec => {
      sec.classList.toggle("fechada", !abrir);
      sec.querySelector(".sh").setAttribute("aria-expanded", String(abrir));
      estado.abertos[sec.dataset.id] = abrir;
    });
  }
});

document.addEventListener("change",e=>{
  const el=e.target;
  if(el && el.matches && el.matches("[data-status-player]")){
    salvarStatus(el.dataset.statusPlayer,el.value);
    render();
  }
});

document.addEventListener("input", e => {
  const el = e.target;
  if (el && el.dataset && el.dataset.k) { LINHAS[el.dataset.k] = el.value; atualizarLinha(el); }
});

["wHome", "wForm", "K", "sd", "kInj"].forEach(id => $(id).addEventListener("input", render));

/* Atualização experimental via feed público NBA CDN.
   Sem dados fabricados: falhas de rede/CORS são exibidas explicitamente. */

const LIVE_SCOREBOARD="https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";
let liveEmCurso=false;
let ultimaLive=null;
const estatisticaLive={pts:"PTS",reb:"REB",ast:"AST",tres:"3PT"};
function nomeNormalizado(s){return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z ]/g,"").replace(/\s+/g," ").trim();}
function atualizarMensagemLive(msg){const el=$("live-status");if(el)el.textContent=msg;}
function statusJogoESPN(jogo){
  const s=jogo.status?.type?.state;
  return s==="post"?"Final":s==="in"?"Ao vivo":"Pré-jogo";
}
function valorEstatisticaESPN(player, chave){
  const category=(player.statistics||[])[0];
  if(!category)return null;
  const nomes=category.labels||category.names||[];
  const estatisticas=category.athletes||[];
  if(!Array.isArray(estatisticas))return null;
  const linha=estatisticas.find(a=>nomeNormalizado(a.athlete?.displayName)===nomeNormalizado(chave.nome));
  if(!linha)return null;
  const nomeEstat=estatisticaLive[chave.categoria];
  const index=nomes.indexOf(nomeEstat);
  if(index<0)return null;
  const raw=linha.stats?.[index];
  if(raw==null||raw==="")return null;
  // ESPN 3PT tem formato acertos-tentativas, ex.: "2-6".
  const valor=Number(nomeEstat==="3PT"?String(raw).split("-")[0]:raw);
  return Number.isFinite(valor)?valor:null;
}
async function atualizarAoVivo(){
  if(PAGINA!=="melhores"||liveEmCurso||typeof DADOS==="undefined")return;
  liveEmCurso=true;
  atualizarMensagemLive("Consultando placar e estatísticas da ESPN...");
  const elementos=[...document.querySelectorAll("[data-live-player]")];
  try{
    const data=String(DADOS.data_jogos||"").replace(/-/g,"");
    const r=await fetch(LIVE_SCOREBOARD+"?dates="+encodeURIComponent(data),{cache:"no-store",signal:AbortSignal.timeout(12000)});
    if(!r.ok)throw Error("Placar HTTP "+r.status);
    const board=await r.json(),jogos=board.events||[];
    const ids=new Set();
    const mapa=new Map();
    for(const el of elementos){
      const t=el.dataset.liveTeam;
      const jogo=jogos.find(ev=>(ev.competitions?.[0]?.competitors||[]).some(c=>(c.team?.abbreviation||"").toUpperCase()===t));
      if(!jogo){el.textContent="Partida não localizada no placar ESPN.";el.classList.add("error");continue;}
      mapa.set(el,jogo);if(jogo.id&&jogo.status?.type?.state!=="pre")ids.add(jogo.id);
    }
    const resumos=new Map();
    await Promise.all([...ids].map(async id=>{
      try{
        const resp=await fetch("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event="+encodeURIComponent(id),{cache:"no-store",signal:AbortSignal.timeout(12000)});
        if(resp.ok)resumos.set(id,await resp.json());
      }catch(e){}
    }));
    let encontrados=0;
    for(const el of elementos){
      const jogo=mapa.get(el);if(!jogo)continue;
      const status=statusJogoESPN(jogo);
      if(status==="Pré-jogo"){el.textContent="Pré-jogo · aguardando estatísticas oficiais";el.classList.remove("error");continue;}
      const resumo=resumos.get(jogo.id);
      const groups=resumo?.boxscore?.players||[];
      const team=groups.find(g=>(g.team?.abbreviation||"").toUpperCase()===el.dataset.liveTeam);
      const valor=team?valorEstatisticaESPN(team,{nome:el.dataset.livePlayer,categoria:el.dataset.liveStat}):null;
      if(valor!==null){
        encontrados++;
        el.textContent="ESPN "+status+" · "+valor+" "+ROTULO[el.dataset.liveStat]+" registrados";
        el.classList.remove("error");
      }else{el.textContent="Estatística não disponível ou jogador não localizado na ESPN.";el.classList.add("error");}
    }
    ultimaLive=new Date();
    atualizarMensagemLive("Fonte: ESPN · "+jogos.length+" jogos encontrados · "+encontrados+" estatísticas carregadas · consulta "+ultimaLive.toLocaleTimeString("pt-BR")+" · atualização a cada 60 segundos.");
  }catch(e){
    atualizarMensagemLive("Não foi possível consultar o placar ESPN neste navegador. Sem dados ao vivo nesta atualização; nenhum resultado foi inventado.");
    elementos.forEach(el=>{el.textContent="Dados ao vivo temporariamente indisponíveis";el.classList.add("error");});
  }finally{liveEmCurso=false;}
}
if(PAGINA==="melhores")setInterval(atualizarAoVivo,60000);

async function consultarLesoesESPN(){
  try{
    const r=await fetch("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries",{cache:"no-store",signal:AbortSignal.timeout(12000)});
    if(!r.ok)throw Error("HTTP "+r.status);
    const dados=await r.json();
    if(!Array.isArray(dados.injuries))throw Error("Formato de lesões desconhecido");
    LESOES_AO_VIVO.clear();
    const apelidos={GS:"GSW",NO:"NOP",NY:"NYK",SA:"SAS",UTAH:"UTA",WSH:"WAS"};
    for(const time of dados.injuries){
      for(const item of time.injuries||[]){
        const a=item.athlete||{}, comentario=(item.shortComment||"").toLowerCase();
        const cod=a.team?.abbreviation||time.team?.abbreviation||"";
        const team=apelidos[cod]||cod;
        const ref=LISTA.flatMap(j=>[j.j.casa,j.j.visitante]).find(t=>t.sigla===team);
        const jogador=(ref?.jogadores||[]).find(p=>limparNomeNBA(p.nome)===limparNomeNBA(a.displayName));
        if(!ref||!jogador)continue;
        let st="Dúvida";
        if(item.status==="Out"||/ruled out|listed as out|downgraded to out|will not play|won't play/.test(comentario))st="Fora";
        else if(/doubtful/.test(comentario))st="Provável ausência";
        else if(/probable/.test(comentario)||item.status==="Probable")st="Provável";
        LESOES_AO_VIVO.set(chaveEscalacao(ref,jogador),st);
      }
    }
    return true;
  }catch(e){return false;}
}
function limparNomeNBA(s){return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z ]/g,"").replace(/\s+/g," ").trim();}
async function atualizarEscalacoesAuto(){
  if(escalacaoConsultando||typeof DADOS==="undefined"||!["escalacoes","melhores"].includes(PAGINA))return;
  escalacaoConsultando=true;
  statusColetaAutomatica="Consultando box scores da NBA...";
  const el=document.getElementById("auto-status");if(el)el.textContent=statusColetaAutomatica;
  try{
    const lesoesOk=await consultarLesoesESPN();
    const res=await fetch("https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json",{cache:"no-store",signal:AbortSignal.timeout(12000)});
    if(!res.ok)throw Error("HTTP "+res.status);
    const dados=await res.json(),board=dados.scoreboard||{};
    if(board.gameDate!==DADOS.data_jogos) {
      statusColetaAutomatica="O feed da NBA está em "+(board.gameDate||"outra data")+", mas esta coleta é de "+DADOS.data_jogos+". Não foram misturadas rodadas.";
      return;
    }
    const jogos=(board.games||[]).filter(j=>[2,3].includes(Number(j.gameStatus)));
    let confirmados=0;
    // Buscamos apenas partidas em andamento/finalizadas. 'starter' não é inferido no pré-jogo.
    await Promise.all(jogos.map(async jogo=>{
      try{
        const r=await fetch("https://cdn.nba.com/static/json/liveData/boxscore/boxscore_"+encodeURIComponent(jogo.gameId)+".json",{cache:"no-store",signal:AbortSignal.timeout(12000)});
        if(!r.ok)return;
        const game=(await r.json()).game||{};
        for(const lado of ["homeTeam","awayTeam"]){
          const team=game[lado];if(!team?.teamTricode)continue;
          const referencia=LISTA.flatMap(x=>[x.j.casa,x.j.visitante]).find(t=>t.sigla===team.teamTricode);
          if(!referencia)continue;
          for(const p of referencia.jogadores||[]){
            const jogador=(team.players||[]).find(x=>limparNomeNBA(x.name)===limparNomeNBA(p.nome));
            if(!jogador)continue;
            const titular=jogador.starter===true||String(jogador.starter)==="1";
            const participou=jogador.played===true||String(jogador.played)==="1";
            // Nem todo nome no box score jogou: DNP/inativo não comprova disponibilidade.
            if(!titular&&!participou)continue;
            const val=titular?"Titular confirmado":"Disponível confirmado";
            STATUS_AUTOMATICOS.set(chaveEscalacao(referencia,p),val);
            confirmados++;
          }
        }
      }catch(e){}
    }));
    statusColetaAutomatica=(lesoesOk?"Lesões ESPN consultadas · ":"Lesões ESPN indisponíveis (usando coleta local) · ")+(jogos.length?
      "NBA: "+confirmados+" jogadores localizados em box scores de "+jogos.length+" partidas iniciadas/finalizadas · consulta "+new Date().toLocaleTimeString("pt-BR")+". Jogadores não localizados mantêm o status da coleta ESPN.":
      "NBA: partidas ainda não iniciadas, sem titulares confirmados via box score.");
  }catch(e){
    statusColetaAutomatica="Box score NBA indisponível. Informações de lesões ESPN consultadas quando permitido; demais status permanecem conforme a última coleta. Nenhuma escalação inventada.";
  }finally{
    escalacaoConsultando=false;
    if(PAGINA==="escalacoes")$("central").innerHTML=centralEscalacoes(LISTA);
    if(PAGINA==="melhores"){
      $("dest").innerHTML=destaques(LISTA);
      document.querySelectorAll("input[data-k]").forEach(el=>{if(el.value)atualizarLinha(el);});
      atualizarAoVivo();
    }
  }
}
if(["escalacoes","melhores"].includes(PAGINA)){
  setInterval(atualizarEscalacoesAuto,90000);
  setTimeout(atualizarEscalacoesAuto,100);
}

render();
