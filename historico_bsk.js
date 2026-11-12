#!/usr/bin/env node
"use strict";
/**
 * Histórico auditável do Project BSK.
 *
 * node historico_bsk.js capturar
 * node historico_bsk.js apurar
 *
 * SNAPSHOTS: imutáveis depois da gravação e apenas antes do início dos jogos.
 * APURAÇÃO: arquivo separado, só usa estatísticas publicadas pela ESPN.
 * Um sinal com linha sintética NÃO constitui uma aposta registrada.
 */
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const vm=require("node:vm");

const ROOT=path.join(__dirname,"historico");
const SNAP=path.join(ROOT,"snapshots");
const RESULTS=path.join(ROOT,"resultados");
const INDICE=path.join(ROOT,"indice.json");
const MARKETS=["pts","reb","ast","tres","blk","stl"];
const ESPN_MARKETS={pts:["PTS"],reb:["REB"],ast:["AST"],tres:["3PT","3PM","FG3M"],blk:["BLK"],stl:["STL"]};
const cfg={version:1,season:"2026-27",policy:"snapshots pré-jogo; sinais sintéticos não são apostas"};
const now=()=>new Date();
function readJSON(file,fallback=null){
 try{return JSON.parse(fs.readFileSync(file,"utf8"));}catch(e){if(e.code==="ENOENT")return fallback;throw e;}
}
function putJSON(file,obj){
 fs.mkdirSync(path.dirname(file),{recursive:true});
 fs.writeFileSync(file,JSON.stringify(obj,null,2)+"\n");
}
function nyDay(date){
 return new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"})
   .format(date);
}
function safeDate(x){return /^\d{4}-\d{2}-\d{2}$/.test(x);}
function norm(x){return String(x||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
 .toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b/g,"").replace(/[^a-z ]/g,"").replace(/\s+/g," ").trim();}
function tricode(x){
 const a=String(x||"").toUpperCase();
 return ({GS:"GSW",NO:"NOP",NY:"NYK",SA:"SAS",UTAH:"UTA",WSH:"WAS"})[a]||a;
}
function mockDocument(){
 const values={wHome:"2.5",wForm:"1.5",K:"12",sd:"12",kInj:"0.12"};
 return {
  body:{dataset:{page:"escalacoes"}},
  getElementById(id){return {value:values[id]||"",innerHTML:"",textContent:"",
    classList:{add(){},remove(){}},addEventListener(){}};},
  querySelectorAll(){return [];},addEventListener(){}
 };
}
function abrirMotor(){
 const script=fs.readFileSync(path.join(__dirname,"bsk.js"),"utf8");
 const raw=fs.readFileSync(path.join(__dirname,"dados.js"),"utf8")
   .replace(/^\s*const\s+DADOS\s*=\s*/,"").replace(/;\s*$/,"");
 const dados=JSON.parse(raw);
 const ctx=vm.createContext({
  DADOS:dados,document:mockDocument(),localStorage:{getItem:()=>null,setItem(){}},
  setInterval(){},setTimeout(){},console,Intl,Date,Math
 });
 vm.runInContext(script+"\nglobalThis.__bsk={LISTA,opcoesDoJogo,sugestaoCondicional};",ctx,
  {filename:"bsk.js",timeout:15000});
 return {dados,motor:ctx.__bsk,
  code_hash:crypto.createHash("sha256").update(script).digest("hex").slice(0,16),
  data_hash:crypto.createHash("sha256").update(raw).digest("hex").slice(0,16)};
}
function selecionarSinais(lista){
 // Exatamente a ordenação usada em destaques() no BSK.
 const todos=lista.flatMap(r=>r._opcoes).sort((a,b)=>b.score-a.score);
 const principais=todos.filter(x=>x.apta&&x.score>0).slice(0,6);
 const observacao=todos.filter(x=>!x.apta&&x.score>0).slice(0,5);
 const marcados=new Map();
 principais.forEach((x,i)=>marcados.set(x,"principal"));
 observacao.forEach((x,i)=>marcados.set(x,"observacao"));
 return marcados;
}
function serializar(q,classe,motor){
 const sinal=motor.sugestaoCondicional(q.proj,q.sd,q.d.media,q.d.jogos,q.risco);
 return {
  id:[q.r.j.horario_utc,q.t.sigla,norm(q.p.nome),q.chave].join("|"),
  jogo_utc:q.r.j.horario_utc,team:q.t.sigla,opponent:q.o.sigla,
  player:q.p.nome,market:q.chave,classificacao:classe,
  projection:Number(q.proj.toFixed(3)),season_mean:q.d.media,
  last5:q.d.ultimos5,sigma:Number(q.sd.toFixed(3)),sample:q.d.jogos,
  score:Number(q.score.toFixed(5)),warnings:[...q.risco],
  signal:sinal.texto,
  exploratory_line:Number.isFinite(sinal.linha)?sinal.linha:null,
  exploratory_side:Number.isFinite(sinal.prob)&&sinal.prob>=0.60?
    (q.proj>=sinal.linha?"Over":"Under"):null,
  exploratory_probability:Number.isFinite(sinal.prob)?Number(sinal.prob.toFixed(4)):null,
  market_line:null,market_odd:null,bet_registered:false
 };
}
function capturar({clock=now()}={}){
 const {dados,motor,code_hash,data_hash}=abrirMotor();
 const day=dados.data_jogos;
 if(!safeDate(day)||day!==nyDay(clock)){
  console.log("Sem captura: dados.js não corresponde à data atual da NBA:",day,nyDay(clock));
  return {captured:false,reason:"data_desatualizada"};
 }
 const arquivo=path.join(SNAP,day+".json");
 if(fs.existsSync(arquivo)){
  console.log("Snapshot existente é imutável:",arquivo);
  return {captured:false,reason:"ja_existe"};
 }
 const analyzed=motor.LISTA.map(r=>Object.assign(r,{_opcoes:motor.opcoesDoJogo(r)}));
 const selecionadas=selecionarSinais(analyzed);
 const partidas=analyzed.filter(r=>{
  const inicio=new Date(r.j.horario_utc).getTime();
  return Number.isFinite(inicio)&&clock.getTime()<inicio-5*60*1000;
 });
 if(!partidas.length){
  console.log("Nenhum jogo elegível: captura após o início não é permitida.");
  return {captured:false,reason:"jogos_iniciados"};
 }
 const ids=new Set(partidas.map(r=>r.j.horario_utc+"|"+r.j.visitante.sigla+"|"+r.j.casa.sigla));
 const picks=[...selecionadas].filter(([q])=>
  ids.has(q.r.j.horario_utc+"|"+q.r.j.visitante.sigla+"|"+q.r.j.casa.sigla)
 ).map(([q,c])=>serializar(q,c,motor));
 const jogos=partidas.map(r=>({start_utc:r.j.horario_utc,
   home:r.j.casa.sigla,away:r.j.visitante.sigla}));
 const snapshot={
  schema:1,date:day,season:cfg.season,captured_at:clock.toISOString(),
  model_hash:code_hash,data_hash,
  fidelity:"Seleção automática reproduz Radar · Melhores do dia com os parâmetros padrão; status e odds inseridos no navegador não são persistidos",
  notes:["Linhas de referência são sintéticas; não são apostas colocadas.",
   "Somente partidas ainda não iniciadas no momento da captura.",
   "Apostas com odds reais exigem um registro adicional pré-jogo."],
  games:jogos,recommendations:picks
 };
 putJSON(arquivo,snapshot);recriarIndice();
 console.log("Snapshot congelado:",day,jogos.length+" jogos,",picks.length+" sinais");
 return {captured:true,snapshot};
}
async function getAPI(url){
 const r=await fetch(url,{headers:{"User-Agent":"ProjectBSK-history/1.0","Accept":"application/json"},signal:AbortSignal.timeout(16000)});
 if(!r.ok)throw Error("ESPN HTTP "+r.status+" "+url);
 return r.json();
}
function findRow(group,name){
 const all=(group?.statistics||[]).flatMap(category=>(category.athletes||[]).map(a=>({a,category})));
 return all.find(x=>norm(x.a.athlete?.displayName||x.a.athlete?.fullName||x.a.displayName)===norm(name))||null;
}
function numericStat(row,market){
 if(!row)return null;
 const heads=(row.category.names||row.category.labels||[]).map(x=>
  String(x).toUpperCase().replace(/[^A-Z0-9]/g,""));
 const target=ESPN_MARKETS[market]||[];
 const index=heads.findIndex(x=>target.includes(x));
 if(index<0)return null;
 const raw=row.a.stats?.[index];
 if(raw==null||raw===""||raw==="--")return null;
 const v=Number(String(raw).split("-")[0]);
 return Number.isFinite(v)?v:null;
}
function minutes(row){
 if(!row)return 0;
 const heads=row.category.names||row.category.labels||[];
 const index=heads.findIndex(x=>String(x).toUpperCase()==="MIN");
 if(index<0)return 0;
 const raw=row.a.stats?.[index];
 if(raw==null||raw===""||raw==="--")return 0;
 const [m,s]=String(raw).split(":").map(Number);
 return Number.isFinite(m)?m+(Number.isFinite(s)?s/60:0):0;
}
function isFinal(event){
 const st=event.status?.type||{};
 return st.completed===true||(st.state==="post"&&/final/i.test(st.name||st.description||""));
}
async function apurarDia(day){
 const snapshot=readJSON(path.join(SNAP,day+".json"));
 if(!snapshot)return {date:day,reason:"snapshot_ausente"};
 const scoreboard=await getAPI("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates="+day.replace(/-/g,""));
 const games=scoreboard.events||[];
 const matching=new Map();
 for(const j of snapshot.games){
  const event=games.find(e=>{
   const competitors=e.competitions?.[0]?.competitors||[];
   const casa=competitors.find(c=>c.homeAway==="home"),fora=competitors.find(c=>c.homeAway==="away");
   return tricode(casa?.team?.abbreviation)===j.home&&tricode(fora?.team?.abbreviation)===j.away;
  });
  matching.set(j.start_utc+"|"+j.away+"|"+j.home,event||null);
 }
 const summaries=new Map();
 await Promise.all([...matching.values()].filter(e=>e?.id&&isFinal(e)).map(async e=>{
  try{
   summaries.set(e.id,await getAPI("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event="+encodeURIComponent(e.id)));
  }catch(err){
   console.warn("Resumo indisponível",e.id,err.message);
  }
 }));
 const partidas=snapshot.games.map(j=>{
  const event=matching.get(j.start_utc+"|"+j.away+"|"+j.home);
  if(!event)return {...j,status:"nao_localizado",home_score:null,away_score:null};
  const competitors=event.competitions?.[0]?.competitors||[];
  const home=competitors.find(c=>c.homeAway==="home");
  const away=competitors.find(c=>c.homeAway==="away");
  const pontos=c=>{
   const v=c?.score?.value??c?.score;
   const n=Number(v);
   return v==null||v===""||!Number.isFinite(n)?null:n;
  };
  return {...j,status:isFinal(event)?"finalizado":event.status?.type?.state||"nao_iniciado",
   home_score:pontos(home),away_score:pontos(away),espn_event_id:event.id||null};
 });
 const results=[];
 for(const pick of snapshot.recommendations){
  const partida=snapshot.games.find(j=>j.start_utc===pick.jogo_utc&&
    [j.home,j.away].includes(pick.team)&&[j.home,j.away].includes(pick.opponent));
  const event=partida?matching.get(partida.start_utc+"|"+partida.away+"|"+partida.home):null;
  const result={id:pick.id,status:"aguardando",actual:null,absolute_error:null,signed_error:null,
   line_result:null,updated_at:now().toISOString()};
  if(!event){result.status="jogo_nao_localizado";results.push(result);continue;}
  if(!isFinal(event)){result.status="jogo_nao_finalizado";results.push(result);continue;}
  const resumo=summaries.get(event.id);
  if(!resumo){result.status="boxscore_indisponivel";results.push(result);continue;}
  const grupo=(resumo.boxscore?.players||[]).find(x=>tricode(x.team?.abbreviation)===pick.team);
  const row=findRow(grupo,pick.player);
  if(!row){result.status="jogador_nao_localizado";results.push(result);continue;}
  if(minutes(row)===0){result.status="nao_atuou";results.push(result);continue;}
  const real=numericStat(row,pick.market);
  if(real===null){result.status="estatistica_indisponivel";results.push(result);continue;}
  result.status="apurado";result.actual=real;
  result.signed_error=Number((pick.projection-real).toFixed(3));
  result.absolute_error=Number(Math.abs(pick.projection-real).toFixed(3));
  // Comparação exploratória, sem alegar que essa cotação existiu no mercado.
  if(Number.isFinite(pick.exploratory_line)&&
      ["Over","Under"].includes(pick.exploratory_side)){
    const passou=pick.exploratory_side==="Over"?
      real>pick.exploratory_line:real<pick.exploratory_line;
    result.line_result=passou?"sinal_teorico_atingido":"sinal_teorico_nao_atingido";
  }
  results.push(result);
 }
 const prev=readJSON(path.join(RESULTS,day+".json"));
 const payload={schema:1,date:day,updated_at:now().toISOString(),source:"ESPN",
   games:partidas,results};
 const stable=JSON.stringify({games:partidas,results:results.map(({updated_at,...r})=>r)});
 const oldStable=JSON.stringify({games:prev?.games||[],results:(prev?.results||[]).map(({updated_at,...r})=>r)});
 if(stable!==oldStable)putJSON(path.join(RESULTS,day+".json"),payload);
 return {date:day,total:results.length,apurados:results.filter(r=>r.status==="apurado").length};
}
function recriarIndice(){
 const names=fs.existsSync(SNAP)?fs.readdirSync(SNAP).filter(n=>/^\d{4}-\d{2}-\d{2}\.json$/.test(n)):[];
 const days=names.map(n=>{
  const d=n.slice(0,10),s=readJSON(path.join(SNAP,n)),r=readJSON(path.join(RESULTS,n));
  return {date:d,captured_at:s.captured_at,games:s.games.length,
   recommendations:s.recommendations.length,
   settled:(r?.results||[]).filter(x=>x.status==="apurado").length,
   finished_games:(r?.games||[]).filter(x=>x.status==="finalizado").length,
   snapshot:"historico/snapshots/"+n,results:r?"historico/resultados/"+n:null};
 }).sort((a,b)=>b.date.localeCompare(a.date));
 const anterior=readJSON(INDICE);
 const novaBase={schema:1,season:cfg.season,
  note:"Sinais do BSK são projeções, não apostas de linha real",days};
 const semData=x=>JSON.stringify({schema:x?.schema,season:x?.season,note:x?.note,days:x?.days});
 if(semData(anterior)!==semData(novaBase)){
  putJSON(INDICE,{...novaBase,updated_at:now().toISOString()});
 }
 return days;
}
async function apurar(){
 const days=fs.existsSync(SNAP)?fs.readdirSync(SNAP).filter(n=>/^\d{4}-\d{2}-\d{2}\.json$/.test(n)).map(n=>n.slice(0,10)):[];
 // Reconsulta os últimos 10 dias, incluindo estatísticas finais corrigidas.
 const relevant=days.sort().reverse().slice(0,10);
 let count=0;
 for(const day of relevant){
  const res=await apurarDia(day);count+=res.apurados||0;
  console.log("Apuração:",res);
 }
 recriarIndice();
 console.log("Histórico:",relevant.length+" rodadas,",count+" projeções apuradas");
 return count;
}
if(require.main===module){
 const mode=process.argv[2];
 (async()=>{
  if(mode==="capturar")capturar();
  else if(mode==="apurar")await apurar();
  else throw Error("Uso: node historico_bsk.js capturar|apurar");
 })().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
}
module.exports={capturar,apurar,apurarDia,recriarIndice,findRow,numericStat,minutes,isFinal,
 selecionarSinais,serializar,nyDay,norm};
