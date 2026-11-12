"use strict";
const assert=require("node:assert/strict");
const {avaliarContexto,consolidar}=require("./metricas_bsk.js");
const jogo={start_utc:"2026-11-13T00:00:00Z",home:"UTA",away:"ORL"};
const pick={id:"p1",jogo_utc:jogo.start_utc,team:"UTA",opponent:"ORL",market:"pts",
 context:{expected_minutes:34,team_absences:["Principal fora"],opponent_absences:[],projected_blowout_risk:false},
 projection:23.2,target:{direction:"acima_de",threshold:23}};
const r1={id:"p1",status:"apurado",actual:25,absolute_error:1.8,target_correct:true,
 context:{actual_minutes:24}};
const out=avaliarContexto(pick,r1,{actual_margin:25});
assert(out.fatores.some(x=>x.id==="minutos_abaixo"));
assert(out.fatores.some(x=>x.id==="placar_elastico"));
assert(out.fatores.some(x=>x.id==="desfalques_time"));
const r2={id:"p1",status:"apurado",actual:21,absolute_error:2.2,target_correct:false,
 context:{actual_minutes:37}};
const dias=[
 {snapshot:{games:[jogo],recommendations:[pick]},results:{games:[{...jogo,actual_margin:25}],results:[r1]}},
 {snapshot:{games:[jogo],recommendations:[pick]},results:{games:[{...jogo,actual_margin:4}],results:[r2]}}
];
const metrics=consolidar(dias);
assert.equal(metrics.geral.total,2);
assert.equal(metrics.geral.acertos,1);
assert.equal(metrics.geral.erros,1);
assert.equal(metrics.geral.taxa_acerto,0.5);
assert.equal(metrics.mercados.pts.erro_absoluto_medio,2);
assert.equal(metrics.contextos.placar_elastico.total,1);
assert.equal(metrics.contextos.minutos_abaixo.total,1);
assert(!Object.keys(metrics).some(x=>/odd|ev|roi/i.test(x)));
assert.equal(consolidar([{snapshot:{recommendations:[pick]},results:{results:[{id:"p1",status:"nao_atuou"}]}}]).geral.total,0);
console.log("OK: classificação, minutagem, blowout, ausências e agregação sem odds");
