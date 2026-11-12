const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const src=fs.readFileSync("bsk.js","utf8");
const a=src.indexOf('const VAGAS_QUINTETO='),b=src.indexOf('function centralEscalacoes(',a);
assert(a>=0&&b>a,"Bloco de quinteto não localizado");
const estado={roster:null};
const ctx=vm.createContext({
 ESCALACOES_FEED:new Map(),statusEfetivo:(t,p)=>p.situacao||"Sem confirmação de titularidade",
 jogadorIndisponivel:(t,p)=>p.situacao==="Fora",
 posicaoJogador:(t,p)=>p.posicao||"",
 posicaoNormalizada:x=>x||"",
 posicoesCompativeis:(a,b)=>a===b,
 ausenciasConfirmadas:t=>t.ausencias||[],
 nomeNormalizado:x=>String(x||"").toLowerCase(),
 esc:x=>String(x),f1:x=>Number(x).toFixed(1)
});
vm.runInContext(src.slice(a,b),ctx);
const team={sigla:"SAS",jogadores:[
 {nome:"Armador Fora",posicao:"PG",minutos:34,situacao:"Fora"},
 {nome:"Armador Substituto",posicao:"PG",minutos:24},
 {nome:"Ala-armador",posicao:"SG",minutos:28},
 {nome:"Ala",posicao:"SF",minutos:30},
 {nome:"Ala-pivô",posicao:"PF",minutos:31},
 {nome:"Pivô",posicao:"C",minutos:32}
],ausencias:[{nome:"Armador Fora",posicao:"PG"}]};
let result=ctx.escalacaoIntegrada(team);
assert.equal(result.vagas.length,5);
assert(result.vagas.some(v=>v.pos==="PG"&&v.jogador?.nome==="Armador Substituto"),
 "O substituto deve ocupar diretamente a vaga PG");
assert(!result.vagas.some(v=>v.jogador?.nome==="Armador Fora"),"Ausente não pode ocupar vaga");
assert.equal(new Set(result.vagas.map(v=>v.jogador?.nome)).size,5,"Não duplicar jogador");
assert(ctx.htmlQuintetoIntegrado(team).includes("Armador Substituto"));
assert(!ctx.htmlQuintetoIntegrado(team).includes("Armador Fora"));
ctx.ESCALACOES_FEED.set("SAS",{jogadores:[
 {nome:"Armador Substituto",posicao:"PG",status:"Titular confirmado",minutos:0},
 {nome:"Ala-armador",posicao:"SG",status:"Titular confirmado",minutos:0},
 {nome:"Ala",posicao:"SF",status:"Titular confirmado",minutos:0},
 {nome:"Ala-pivô",posicao:"PF",status:"Titular confirmado",minutos:0},
 {nome:"Pivô",posicao:"C",status:"Titular confirmado",minutos:0}
]});
result=ctx.escalacaoIntegrada(team);
assert(result.completo,"Cinco titulares ESPN tornam o quinteto confirmado");
assert(result.vagas.every(v=>v.jogador?.confirmado));
console.log("OK: substituto integrado, cinco vagas únicas, desfalque excluído e titulares ESPN priorizados");
