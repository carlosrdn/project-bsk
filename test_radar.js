// Regressões offline do motor de projeções e análise de apostas BSK.
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const source=fs.readFileSync("bsk.js","utf8");
function trecho(a,b){const i=source.indexOf(a),j=source.indexOf(b,i+a.length);assert(i>=0&&j>i,a);return source.slice(i,j);}
const ctx=vm.createContext({});
const setup=`
const clamp=(v,a,b)=>Math.min(Math.max(v,a),b);
const desvioPrior=(k,m)=>k==="pts"?0.3*m+1.2:k==="reb"?0.36*m+0.5:k==="ast"?0.45*m+0.5:Math.sqrt(Math.max(m,0))+0.2;
const f1=x=>Number(x).toFixed(1).replace(".",",");
const pct=x=>(x*100).toFixed(1).replace(".",",")+"%";
const cdf=z=>0.5*(1+(function erf(x){const s=x<0?-1:1;x=Math.abs(x);const t=1/(1+0.3275911*x);return s*(1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-x*x));})(z/Math.SQRT2));
`;
vm.runInContext(setup+trecho("function projetar(","function rodadaAtual("),ctx);
const t={ritmo:100,ataque:110},o={ritmo:100,nivel:"fraca"},r={sc:110,sv:108,margem:2};
const d={media:22,ultimos5:35,jogos:14,desvio:5};
const atual=ctx.projetar("pts",d,t,o,r,true,50),antiga=ctx.projetar("pts",{...d,ultimos5:22},t,o,r,true,0);
assert(atual.proj>antiga.proj,"Forma recente superior deve elevar previsão");
assert(atual.proj>22,"Projeção não deve copiar média quando há sinal recente");
assert.equal(atual.bump,0,"Bônus de lesões não comprovado não pode elevar média");
assert.equal(atual.proj,ctx.projetar("pts",{...d,por_nivel:{fraca:{media:500}}},t,o,r,true,0).proj,
 "Nível do adversário calculado retrospectivamente não deve vazar");
const menosMin=ctx.projetar("pts",{...d,minutos_media:32,minutos_ultimos5:25},t,o,r,true,0);
assert(menosMin.proj<atual.proj,"Minutos recentes menores reduzem estimativa");
const castle=ctx.analiseMercado(6.3,1,5.5,1.90,15,[]);
const inverso=ctx.analiseMercado(4.7,1,5.5,1.90,15,[]);
assert.equal(castle.lado,"Over");
assert.equal(inverso.lado,"Under");
assert(castle.prob>0.60);
assert(castle.apta,"Com odds e amostra suficientes, sinal de Castle deve passar");
assert(!ctx.analiseMercado(6.3,1,5.5,NaN,15,[]).apta,"Sem odds não aprovar aposta");
assert(!ctx.analiseMercado(6.3,1,5.5,1.05,15,[]).apta,"Odd sem valor não aprova");
assert(!ctx.analiseMercado(6.3,1,5.5,1.90,6,[]).apta,"Amostra insuficiente");
assert(!ctx.analiseMercado(6.3,1,5.5,1.90,15,["Fora"]).apta,"Desfalque impede aposta");
vm.runInContext(trecho("function avaliarLinhaReal(","function pickHtml("),ctx);
const sugestao=ctx.sugestaoCondicional(25.9,5,22,14,[]);
assert(sugestao.prob>0.60,"Sinal tem que preservar probabilidade no ranking");
const riscoCtx=vm.createContext({elegibilidade:()=>[],sugestaoCondicional:ctx.sugestaoCondicional});
vm.runInContext(trecho("function pontuar(","function opcoesDoJogo("),riscoCtx);
const q={proj:25.9,sd:5,d:{media:22,jogos:14},chave:"pts"};
assert.equal(riscoCtx.pontuar({...q,ref:10}).score,riscoCtx.pontuar({...q,ref:100}).score,
 "Linha sintética não pode influenciar o score");
assert(!trecho("function opcoesDoJogo(","function motivo(").includes("dir:"),
 "Não definir lado antes da linha real");
console.log("OK: recência, minutos, ausência de vazamento, probabilidade, EV, odds e Castle");
