# Project BSK

Painel de prognósticos da NBA e ferramentas de avaliação do modelo.

## Backtesting walk-forward

Na branch `melhorias-modelo-nba`, execute:

```bash
pip install nba_api
python backtest.py
```

O script consulta os logs da temporada definida em `TEMPORADA` no próprio arquivo
e gera `backtest_resultados.json`, com métricas separadas para pontos, rebotes,
assistências e bolas de três.

O teste é cronológico: cada previsão usa apenas partidas anteriores do jogador.
São exigidas pelo menos 5 partidas anteriores com 12 minutos ou mais.

### Métricas

- **MAE:** erro absoluto médio da projeção.
- **RMSE:** penaliza mais os erros grandes.
- **Viés:** indica se o modelo tende a superestimar (positivo) ou subestimar (negativo).
- **Dentro de 1 ponto:** percentual de projeções cuja diferença para o resultado real foi de até 1.

### Limitações da primeira versão

O teste avalia o erro das projeções estatísticas individuais. Ainda não incorpora
adversário, mando de quadra, lesões ou escalações históricas, nem linhas reais de
casas de apostas. Portanto, não deve ser interpretado como taxa de acerto de apostas
ou retorno financeiro.

## Painel visual

Depois de gerar `backtest_resultados.json`, abra `backtest.html` no navegador
e selecione esse arquivo. O painel lê o JSON localmente, sem enviar os dados
para um servidor. É possível filtrar as previsões por categoria e nome do jogador.

## Testes offline

Para validar conversões de data/minutos e as regras walk-forward sem consultar a API:

```bash
python -m unittest test_backtest.py
```


## Comparação dos pesos recentes

O backtest também gera `comparacao_modelos` no JSON, comparando pesos 0%, 20%, 35%, 50%, 75% e 100% para os cinco jogos anteriores mais recentes, sempre usando os mesmos jogos válidos. Inclui segmentação de jogadores conforme variação dos minutos nos últimos cinco jogos anteriores (estável: amplitude até cinco minutos; variável: acima disso).

**Correção importante:** a primeira versão selecionava os cinco jogos *mais antigos* como recentes. Para não apagar essa referência, o campo `estatisticas` mantém as projeções legadas, e a seção `comparacao_modelos` apresenta tanto o legado quanto as variantes corrigidas. A correção fica no cálculo `projetar()`; o objetivo é comparar os resultados antes de mudar o painel principal. Os pesos explorados não foram validados num período independente. Não interpretar diferenças retrospectivas como garantia de retorno ou melhora futura.
