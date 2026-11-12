# BSK — frontend experimental

Primeira fase da migração para React + TypeScript + Vite, isolada do site clássico.

## Desenvolvimento local

    cd frontend
    npm install
    npm test
    npm run dev

O plugin de desenvolvimento Vite disponibiliza o mesmo arquivo ../dados.js da raiz do repositório. No GitHub Pages, o frontend publicado na pasta /novo/ lê ../dados.js.

O modelo em src/model.ts é uma porta da função analisar() do bsk.js antigo; o teste npm test compara todas as partidas do snapshot, incluindo pontos, total, margem, chances e impactos de ausências. O build falha antes da publicação se houver divergência.

O workflow .github/workflows/frontend-preview.yml gera os arquivos de produção em novo/ na branch melhorias-modelo-nba. O GitHub Pages, quando configurado para publicar a raiz dessa branch, expõe a prévia em:

https://carlosrdn.github.io/project-bsk/novo/

O site clássico continua na raiz. Radar, Escalações, Histórico e Backtest ainda usam o aplicativo anterior. Nenhum snapshot ou modelo Python é alterado por essa prévia.

A versão experimental identifica dados antigos, não usa valores fictícios quando dados.js falha e não apresenta odds nem métricas financeiras.

## Próximas etapas

Migrar Radar, Escalações e Histórico progressivamente; centralizar os cálculos em um módulo comum para as duas interfaces; adicionar testes de navegação e de carregamento no navegador; e somente após validação decidir se a raiz do site será substituída.
