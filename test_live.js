// Regressão offline: formato de box score ESPN e confirmação de participação.
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const src=fs.readFileSync("bsk.js","utf8");
function trecho(inicio,fim){
  const a=src.indexOf(inicio),b=src.indexOf(fim,a+inicio.length);
  assert(a>=0&&b>a,"Bloco ausente: "+inicio);
  return src.slice(a,b);
}
const pre=`
const nomeNormalizado=s=>String(s||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase().replace(/[^a-z ]/g,"").replace(/\\s+/g," ").trim();
`;
const ctx=vm.createContext({});
vm.runInContext(pre+trecho("const COLUNAS_ESPN=","let liveEmCurso=false;"),ctx);
const equipe={team:{abbreviation:"SAS"},statistics:[{
 names:["MIN","FG","3PT","FT","OREB","DREB","REB","AST","STL","BLK","TO","PF","+/-","PTS"],
 athletes:[
  {athlete:{displayName:"Stephon Castle"},starter:true,stats:["17:32","3-9","2-4","2-2","0","3","3","4","1","0","2","1","+5","10"]},
  {athlete:{displayName:"Victor Wembanyama"},starter:false,stats:["12:15","4-8","1-3","0-0","1","6","7","2","0","3","0","1","+6","9"]},
  {athlete:{displayName:"Jogador DNP"},starter:false,stats:["--","--","--","--","--","--","--","--","--","--","--","--","--","--"]}
 ]}]};
const cast=ctx.dadosAtletaESPN(equipe,"Stephon Castle");
assert(cast,"Castle localizado no elenco");
assert.equal(ctx.estatisticaAtletaESPN(cast.atleta,cast.headers,"pts"),10);
assert.equal(ctx.estatisticaAtletaESPN(cast.atleta,cast.headers,"reb"),3);
assert.equal(ctx.estatisticaAtletaESPN(cast.atleta,cast.headers,"tres"),2);
assert.equal(ctx.estatisticaAtletaESPN(cast.atleta,cast.headers,"stl"),1);
assert.equal(ctx.statusAtletaESPN(cast),"Titular confirmado");
const w=ctx.dadosAtletaESPN(equipe,"Victor Wembanyama");
assert.equal(ctx.estatisticaAtletaESPN(w.atleta,w.headers,"blk"),3);
assert.equal(ctx.statusAtletaESPN(w),"Disponível confirmado");
assert.equal(ctx.statusAtletaESPN(ctx.dadosAtletaESPN(equipe,"Jogador DNP")),null,
 "Estar no box score não significa ter jogado");
assert.equal(ctx.dadosAtletaESPN(equipe,"Outro Jogador"),null);
console.log("OK: parsers ESPN, seis estatísticas, titulares, banco e DNP");
