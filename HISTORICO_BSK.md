# Histórico BSK — documentação de operação

O histórico registra o que o modelo selecionou antes da partida, sem reconstrução retrospectiva. Funciona com arquivos JSON versionados no GitHub, sem banco tradicional.

## Estrutura
- historico_bsk.js: motor Node 22 (captura e apuração).
- historico.html: página de jogos e desempenho.
- historico/indice.json: índice das rodadas.
- historico/snapshots/AAAA-MM-DD.json: snapshot imutável após a primeira gravação, com horário, hashes do motor/dados e sinais selecionados.
- historico/resultados/AAAA-MM-DD.json: estatísticas reais da ESPN e comparações.
- .github/workflows/historico-bsk.yml: workflow na branch melhorias-modelo-nba.

## Execução
Executar, na raiz do repositório: node test_historico.js, node historico_bsk.js capturar e node historico_bsk.js apurar.

A captura exige dados.js da data atual da NBA em Nova York, arquivo do dia inexistente e ao menos uma partida ainda a mais de cinco minutos do início. Não registra retroativamente sinais que já passaram do horário.

A seleção usa os mesmos filtros e pontuações da página Melhores do Dia com parâmetros padrão. Registra somente projeções e alertas de risco.

A apuração consulta ESPN scoreboard e summary para os dez últimos dias com snapshots. Jogador DNP, box score indisponível ou partida pendente não conta como erro numérico de previsão. Resultados ficam separados dos snapshots para não mudar o que foi previsto.

## Critério de transparência
O histórico mede apenas proximidade entre projeção pré-jogo e estatística real, por mercado, com erro absoluto. Não calcula preços ou retorno financeiro.

## Limite da automação na branch
Push de dados.js, bsk.js, historico_bsk.js ou do workflow pode disparar GitHub Actions na branch de testes. Existe workflow_dispatch para uso manual quando o GitHub o disponibiliza.
Agendamentos GitHub cron são executados apenas quando o workflow está na branch padrão. Como a main não deve ser alterada sem autorização, não há apuração automática garantida por horário nesta fase. Fazer uma nova execução após os jogos para obter resultados.
O workflow exige permissões contents: write. O Pages só mostra a página nova se publicar esta branch.

## Auditoria
Não sobrescrever snapshots antigos. Cada captura inclui captured_at, model_hash, data_hash, status de projeção, estatística prevista, desvio e avisos. Recalcular o resultado jamais recalcula a previsão.

## Análise de equipes e organização da página

A partir do schema 2, cada confronto recebe, antes do início, as projeções da mesma função `analisar()` usada em Jogos: pontos da equipe mandante, pontos da visitante, total, margem, favorito, probabilidade aproximada de vitória e ritmo. Após a partida, o arquivo de resultados recebe os pontos finais reais e os erros das projeções de equipe, além da indicação de acerto do vencedor (sem cotação/odds).

Na página Histórico, cada confronto aparece como um menu recolhível. Dentro dele há duas opções: **Histórico de acertos do jogo** e **Histórico dos jogadores**, com avaliações separadas.

Snapshots anteriores ao schema 2 permanecem imutáveis e não possuem previsões do placar. A página deve sinalizar expressamente a ausência dessas projeções em vez de inferi-las após o jogo.
