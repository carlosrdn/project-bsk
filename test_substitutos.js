const assert=require("node:assert/strict"),vm=require("node:vm"),fs=require("node:fs");
const code=fs.readFileSync("bsk.js","utf8");
const a=code.indexOf("const POSICOES_ESPN="),b=code.indexOf("function centralEscalacoes(",a);
assert(a>=0&&b>a);
const ctx=vm.createContext({
 DADOS:{data_jogos:"2026-11-11"},nomeNormalizado:x=>String(x||"").toLowerCase(),
 chaveEscalacao:(t,p)=>"2026-11-11|"+t.sigla+"|"+p.nome,
 statusEfetivo:(t,p)=>p.situacao||"Sem confirmação de titularidade",
 statusManual:()=>"Não verificado",statusInfo:(t,p)=>({valor:p.situacao}),
 jogadorIndisponivel:(t,p)=>p.situacao==="Fora",
 esc:x=>String(x),f1:x=>Number(x).toFixed(1).replace(".",",")
});
vm.runInContext(code.slice(a,b),ctx);
const team={sigla:"SAS",ausencias:[{nome:"Titular Fora",situacao:"Fora",posicao:"PG"}],
 jogadores:[
 {nome:"Titular Fora",situacao:"Fora",posicao:"PG",minutos:32},
 {nome:"Armador Reserva",posicao:"PG",minutos:22},
 {nome:"Ala Principal",posicao:"SF",minutos:34}
]};
const html=ctx.quadroSubstituicoes(team);
assert(html.includes("Titular Fora"));
assert(html.includes("Armador Reserva"));
assert(!html.includes("Ala Principal"));
assert(html.includes("Candidato por posição e minutos"));
team.jogadores[1].situacao="Titular confirmado";
assert(ctx.quadroSubstituicoes(team).includes("Titular confirmado"));
team.jogadores[0].situacao="Disponível confirmado";
assert(!ctx.quadroSubstituicoes(team).includes("Titular Fora"));
console.log("OK: reserva por posição, titular confirmado e ausência revertida");
