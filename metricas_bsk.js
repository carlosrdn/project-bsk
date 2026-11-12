"use strict";
/* Métricas de avaliação pós-jogo — sem odds ou inferência de causalidade.
   Entrada: previsões congeladas pré-jogo e resultados ESPN. */
const valor=x=>typeof x==="number"&&Number.isFinite(x)?x:null;
const arred=x=>Math.round(x*1000)/1000;
function avaliarContexto(pick,resultado,jogo){
 if(resultado?.status!=="apurado")return {fatores:[],resumo:"Resultado ainda não apurado."};
 const pre=pick.context||{},pos=resultado.context||{},fatores=[];
 const esperado=valor(pre.expected_minutes),real=valor(pos.actual_minutes);
 if(esperado!==null&&real!==null){
  const diferenca=real-esperado;
  if(diferenca<=-6)fatores.push({id:"minutos_abaixo",tipo:"observado",valor:arred(diferenca),
    texto:"Atuou "+Math.abs(arred(diferenca))+" min abaixo da referência pré-jogo"});
  else if(diferenca>=6)fatores.push({id:"minutos_acima",tipo:"observado",valor:arred(diferenca),
    texto:"Atuou "+arred(diferenca)+" min acima da referência pré-jogo"});
 }
 const margem=valor(jogo?.actual_margin);
 if(margem!==null&&Math.abs(margem)>=20){
  fatores.push({id:"placar_elastico",tipo:"observado",valor:Math.abs(margem),
    texto:"Diferença final de "+Math.abs(margem)+" pontos (possível blowout)"});
 }
 if(pre.team_absences?.length)fatores.push({id:"desfalques_time",tipo:"contexto_pre_jogo",
  quantidade:pre.team_absences.length,texto:pre.team_absences.length+" ausência(s) registrada(s) na equipe antes do jogo"});
 if(pre.opponent_absences?.length)fatores.push({id:"desfalques_adversario",tipo:"contexto_pre_jogo",
  quantidade:pre.opponent_absences.length,texto:pre.opponent_absences.length+" ausência(s) no adversário antes do jogo"});
 if(pre.projected_blowout_risk)fatores.push({id:"risco_blowout_pre",tipo:"contexto_pre_jogo",
  texto:"Modelo indicava possível jogo desequilibrado antes da partida"});
 return {fatores,resumo:fatores.length?
  "Fatores associados ao resultado; não demonstram causalidade.":"Não foram identificados fatores de contexto nos campos disponíveis."};
}
function consolidar(dias){
 const mercados={},contextos={},geral={avaliados:0,acertos:0,erros:0,sem_limite:0,erro_absoluto_soma:0};
 const destaques={avaliados:0,acertos:0,erros:0,sem_limite:0,erro_absoluto_soma:0};
 const jogos={total:0,vencedor_acertado:0,vencedor_errado:0,limites_atingidos:0,limites_nao_atingidos:0,mae_pontos_soma:0,mae_pontos_amostra:0};
 for(const d of dias){
  const partidas=new Map((d.results?.games||[]).map(g=>
   [[g.start_utc,g.away,g.home].join("|"),g]));
  for(const partida of d.snapshot?.games||[]){
   const final=partidas.get([partida.start_utc,partida.away,partida.home].join("|"));
   const cmp=final?.comparison;
   if(final?.status!=="finalizado"||!partida.prediction||!cmp)continue;
   jogos.total++;
   if(cmp.winner_correct===true)jogos.vencedor_acertado++;
   else if(cmp.winner_correct===false)jogos.vencedor_errado++;
   for(const valor of Object.values(cmp.targets_correct||{})){
    if(valor===true)jogos.limites_atingidos++;
    else if(valor===false)jogos.limites_nao_atingidos++;
   }
   for(const er of [cmp.home_points_error,cmp.away_points_error]){
    if(valor(er)!==null){jogos.mae_pontos_soma+=Math.abs(er);jogos.mae_pontos_amostra++;}
   }
  }
  for(const p of d.snapshot?.recommendations||[]){
   const r=(d.results?.results||[]).find(x=>x.id===p.id);
   if(!r||r.status!=="apurado")continue;
   const g=(d.snapshot?.games||[]).find(j=>j.start_utc===p.jogo_utc&&
      [j.home,j.away].includes(p.team)&&[j.home,j.away].includes(p.opponent));
   const chave=g?[g.start_utc,g.away,g.home].join("|"):"";
   const final=partidas.get(chave);
   const fatores=avaliarContexto(p,r,final);
   const m=mercados[p.market]||={avaliados:0,acertos:0,erros:0,sem_limite:0,mae_soma:0};
   m.avaliados++;geral.avaliados++;
   const erro=valor(r.absolute_error);
   if(erro!==null){m.mae_soma+=erro;geral.erro_absoluto_soma+=erro;}
   if(r.target_correct===true){m.acertos++;geral.acertos++;}
   else if(r.target_correct===false){m.erros++;geral.erros++;}
   else{m.sem_limite++;geral.sem_limite++;}
   if(p.classificacao==="principal"){
    destaques.avaliados++;
    destaques.erro_absoluto_soma+=erro||0;
    if(r.target_correct===true)destaques.acertos++;
    else if(r.target_correct===false)destaques.erros++;
    else destaques.sem_limite++;
   }
   mercados[p.market]=m;
   for(const f of fatores.fatores){
    const k=f.id;
    const c=contextos[k]||{total:0,acertos:0,erros:0,sem_limite:0,mae_soma:0};
    c.total++;c.mae_soma+=erro||0;
    if(r.target_correct===true)c.acertos++;
    else if(r.target_correct===false)c.erros++;
    else c.sem_limite++;
    contextos[k]=c;
   }
  }
 }
 const resumo=x=>({
  total:x.avaliados??x.total,acertos:x.acertos,erros:x.erros,sem_limite:x.sem_limite,
  taxa_acerto:x.acertos+x.erros?arred(x.acertos/(x.acertos+x.erros)):null,
  erro_absoluto_medio:(x.avaliados??x.total)?arred((x.mae_soma??x.erro_absoluto_soma)/(x.avaliados??x.total)):null
 });
 return {
  schema:1,metodologia:"Avaliação por limite congelado pré-jogo; contextos associados, sem causalidade; sem odds",
  periodo_dias: dias.length,
  geral:resumo(geral),
  destaques:resumo(destaques),
  jogos:{total:jogos.total,vencedor_acertado:jogos.vencedor_acertado,vencedor_errado:jogos.vencedor_errado,
   taxa_acerto_vencedor:jogos.vencedor_acertado+jogos.vencedor_errado?arred(jogos.vencedor_acertado/(jogos.vencedor_acertado+jogos.vencedor_errado)):null,
   limites_atingidos:jogos.limites_atingidos,limites_nao_atingidos:jogos.limites_nao_atingidos,
   mae_pontos_equipes:jogos.mae_pontos_amostra?arred(jogos.mae_pontos_soma/jogos.mae_pontos_amostra):null},
  mercados:Object.fromEntries(Object.entries(mercados).map(([k,v])=>[k,resumo(v)])),
  contextos:Object.fromEntries(Object.entries(contextos).map(([k,v])=>[k,resumo(v)]))
 };
}
module.exports={avaliarContexto,consolidar};