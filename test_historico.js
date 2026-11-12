// Testes offline do histórico. Nunca consomem endpoints reais.
"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const hist=require("./historico_bsk.js");
const base={statistics:[{name:"Starters",names:["MIN","PTS","REB","AST","3PT","STL","BLK"],
  athletes:[{athlete:{displayName:"Stephon Castle"},stats:["30:42","16","8","5","2-6","1","0"]},
    {athlete:{displayName:"Reserva DNP"},stats:["--","--","--","--","--","--","--"]}]}]};
const row=hist.findRow(base,"Stephon Castle");
assert(row,"Conferir nome no box score");
assert.equal(hist.numericStat(row,"pts"),16);
assert.equal(hist.numericStat(row,"reb"),8);
assert.equal(hist.numericStat(row,"ast"),5);
assert.equal(hist.numericStat(row,"tres"),2);
assert.equal(hist.numericStat(row,"stl"),1);
assert.equal(hist.numericStat(row,"blk"),0);
assert(hist.minutes(row)>30);
assert.equal(hist.minutes(hist.findRow(base,"Reserva DNP")),0,"DNP não é derrota de uma aposta");
assert.equal(hist.isFinal({status:{type:{completed:true,state:"post"}}}),true);
assert.equal(hist.isFinal({status:{type:{completed:false,state:"in"}}}),false);
assert.equal(hist.norm("Stephon Castle Jr."),hist.norm("Stephon Castle"),"Normalizar sufixo");
assert.equal(hist.nyDay(new Date("2026-11-12T01:00:00Z")),"2026-11-11","Fuso NBA de NY");

const q=(score,apta)=>({score,apta});
const sample=[{_opcoes:[q(0.5,true),q(0.4,false),q(-0.1,true)]}];
const selecoes=hist.selecionarSinais(sample);
assert.equal(selecoes.size,2,"Score negativo não é recomendação");
assert.deepEqual([...selecoes.values()],["principal","observacao"]);

// Teste o motor real em um documento fictício, sem consultar a rede.
const script=fs.readFileSync("bsk.js","utf8");
const dados=JSON.parse(fs.readFileSync("dados.js","utf8").replace(/^\s*const\s+DADOS\s*=\s*/,"").replace(/;\s*$/,""));
const inputs={wHome:2.5,wForm:1.5,K:12,sd:12,kInj:0.12};
const doc={
 body:{dataset:{page:"escalacoes"}},
 getElementById:id=>({value:String(inputs[id]??""),innerHTML:"",textContent:"",
   classList:{add(){},remove(){}},addEventListener(){}}),
 addEventListener(){},querySelectorAll:()=>[]
};
const contexto=vm.createContext({DADOS:dados,document:doc,
 localStorage:{getItem:()=>null,setItem(){}},setTimeout(){},setInterval(){},console,Intl,Date,Math});
vm.runInContext(script+"\nglobalThis.__history={LISTA,opcoesDoJogo};",contexto,
  {filename:"bsk.js",timeout:15000});
assert.equal(contexto.__history.LISTA.length,dados.jogos.length,
 "Snapshot deve usar o mesmo radar que a página");
assert(Array.isArray(contexto.__history.opcoesDoJogo(contexto.__history.LISTA[0])));
// O mesmo analisar() usado na página deve preencher o registro da equipe.
const teste=contexto.__history.LISTA[0];
assert(Number.isFinite(teste.sc)&&Number.isFinite(teste.sv)&&Number.isFinite(teste.margem),
 "Projeções de pontos e margem devem existir antes da captura");
assert(Math.abs((teste.sc-teste.sv)-teste.margem)<0.001,"Margem consistente");
const collector=fs.readFileSync("historico_bsk.js","utf8");
assert(collector.includes("home_points:arred(r.sc)")&&collector.includes("away_points:arred(r.sv)"),
 "Guardar pontos pré-jogo das duas equipes");
assert(collector.includes("total_points_error")&&collector.includes("winner_correct"),
 "Confrontar pontos totais, margem e vencedor com resultado final");
const page=fs.readFileSync("historico.html","utf8");
assert(page.includes('<details class="game-history"'),
 "Cada confronto precisa de um menu recolhível");
assert(page.includes("Histórico de acertos do jogo")&&page.includes("Histórico dos jogadores"),
 "Menu precisa ter as duas opções solicitadas");
console.log("OK: histórico BSK, feed ESPN, DNP, NBA timezone, seleção do radar");
