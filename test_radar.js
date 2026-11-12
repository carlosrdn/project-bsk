// Regressões offline: projeções contextuais e triagem histórica, sem odds.
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const source=fs.readFileSync("bsk.js","utf8");
function trecho(a,b){const i=source.indexOf(a),j=source.indexOf(b,i+a.length);assert(i>=0&&j>i,a);return source.slice(i,j);}
const ctx=vm.createContext({});
const setup=`
const clamp=(v,a,b)=>Math.min(Math.max(v,a),b);
const desvioPrior=(k,m)=>k==="pts"?0.3*m+1.2:k==="reb"?0.36*m+0.5:k==="ast"?0.45*m+0.5:Math.sqrt(Math.max(m,0))+0.2;
const f1=x=>Number(x).toFixed(1).replace(".",",");
`;
vm.runInContext(setup+trecho("function projetar(","function rodadaAtual("),ctx);
const t={ritmo:100,ataque:110},o={ritmo:100},r={sc:110,sv:108,margem:2};
const d={media:22,ultimos5:35,jogos:14,desvio:5};
const atual=ctx.projetar("pts",d,t,o,r,true,50),anterior=ctx.projetar("pts",{...d,ultimos5:22},t,o,r,true,0);
assert(atual.proj>anterior.proj,"Recência acima da média eleva projeção");
assert(atual.proj>22,"Projeção não pode ser cópia automática da média");
assert.equal(atual.bump,0,"Não inventar redistribuição por ausência");
assert.equal(atual.proj,ctx.projetar("pts",{...d,por_nivel:{fraca:{media:500}}},t,o,r,true,0).proj);
assert(ctx.projetar("pts",{...d,minutos_media:32,minutos_ultimos5:25},t,o,r,true,0).proj<atual.proj);
const resumo=ctx.resumoProjecao(25,22,24,5,14,[]);
assert(resumo.texto.includes("Projeção 25,0"));
assert(resumo.texto.includes("acima da média"));
const riscoCtx=vm.createContext({elegibilidade:()=>[]});
vm.runInContext(trecho("function pontuar(","function opcoesDoJogo("),riscoCtx);
const q={proj:25,sd:5,d:{media:22,jogos:14},chave:"pts"};
assert.equal(riscoCtx.pontuar({...q,ref:10}).score,riscoCtx.pontuar({...q,ref:100}).score);
assert(riscoCtx.pontuar(q).apta,"Amostra e variação suficientes");
assert(!riscoCtx.pontuar({...q,d:{media:22,jogos:6}}).apta);
assert(!source.includes("data-market-odd"),"Não exibir preço em nenhuma página do radar");
assert(!source.includes("analiseMercado("),"Motor não deve calcular cotação ou retorno esperado");
assert(!source.includes("camposMercado("),"Não exibir entradas de mercado");
console.log("OK: projeções, recência, minutos, robustez, filtros e ausência de odds");
