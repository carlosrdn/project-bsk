// Testes offline dos cálculos; não precisam de navegador nem de NBA API.
const fs=require("node:fs");
const assert=require("node:assert/strict");
const vm=require("node:vm");
const source=fs.readFileSync("bsk.js","utf8");
const trecho=(inicio,fim)=>{
  const a=source.indexOf(inicio),b=source.indexOf(fim,a+inicio.length);
  assert(a>=0&&b>a,"Trecho do motor não encontrado: "+inicio);
  return source.slice(a,b);
};
const setup=`
const clamp=(x,a,b)=>Math.min(Math.max(x,a),b);
const desvioPrior=(chave,m)=>chave==="pts"?0.3*m+1.2:chave==="reb"?0.36*m+0.5:
chave==="ast"?0.45*m+0.5:Math.sqrt(Math.max(m,0))+0.2;
`;
const ctx=vm.createContext({});
vm.runInContext(setup+trecho("function projetar(","function elegibilidade("),ctx);
const d={media:22,ultimos5:35,jogos:14,desvio:5,por_nivel:{fraca:{media:60,jogos:10}}};
const team={ritmo:100,ataque:110},opp={ritmo:100,nivel:"fraca"};
const game={sc:110,sv:108,margem:2};
const a=ctx.projetar("pts",d,team,opp,game,true,50);
const b=ctx.projetar("pts",{...d,ultimos5:5,por_nivel:{fraca:{media:1,jogos:1}}},team,opp,game,true,0);
assert.equal(a.proj,b.proj,"Nível retrospectivo/ult5 não pode deslocar modelo base validável");
assert.equal(a.proj,22,"Com ritmo/placar neutros o resultado deve ser a média");
assert.equal(a.bump,0,"Ajuste de lesões sem backtest não pode afetar previsão");

const riscoCtx=vm.createContext({elegibilidade:()=>[]});
vm.runInContext(trecho("function pontuar(","function opcoesDoJogo("),riscoCtx);
const jogador={d:{media:18,jogos:18},sd:5,chave:"pts",proj:18};
const scoreA=riscoCtx.pontuar({...jogador,ref:10});
const scoreB=riscoCtx.pontuar({...jogador,ref:2000});
assert.equal(scoreA.score,scoreB.score,"Linha sintética não pode criar vantagem artificial");
assert.equal(scoreA.apta,scoreB.apta,"Linha fictícia não pode mudar triagem");
assert(!source.includes("Over</span>"),"Exibição não deve forçar Over sem linha real");

// Regressão Castle: nunca recomendar Under quando projeção está acima da linha.
const direcaoContexto=vm.createContext({});
vm.runInContext('const f1=x=>x.toFixed(1).replace(".",",");\n'+
  trecho("function avaliarLinhaReal(","function pickHtml("),direcaoContexto);
const castle=direcaoContexto.avaliarLinhaReal(6.3,1.0,5.5,[],12);
const castleInverso=direcaoContexto.avaliarLinhaReal(4.7,1.0,5.5,[],12);
assert(castle.texto.includes("Over 5,5"),"6,3 projetados contra linha real 5,5 devem indicar Over");
assert(castleInverso.texto.includes("Under 5,5"),"4,7 projetados contra linha real 5,5 devem indicar Under");
assert(!trecho("function opcoesDoJogo(","function motivo(").includes('dir:'),
  "Radar não deve pré-definir Over/Under a partir de linha sintética");
assert(!trecho("function pickHtml(","function atualizarLinha(").includes('x.ref)'),
  "Radar não deve exibir linha sintética como se fosse uma linha utilizável");

console.log("OK: projeção, lesões, direção Castle 6,3 vs 5,5 e triagem");
