import evaluation from './evaluation/replay-2026-11-11.json'

const number = (value: number | null) => value == null ? '—' : value.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
const percent = (value: number) => (100 * value).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%'
const date = (value: string) => value.split('-').reverse().join('/')
const labels = { pts: 'Pontos', reb: 'Rebotes', ast: 'Assistências', tres: 'Bolas de três' }

function Results({ rows }: { rows: { label: string; model: string; baseline: string; sample: number }[] }) {
  return <div className="history-table"><table>
    <thead><tr><th scope="col">Métrica</th><th scope="col">BSK</th><th scope="col">Referência</th><th scope="col">Amostra</th></tr></thead>
    <tbody>{rows.map(row => <tr key={row.label}>
      <th scope="row">{row.label}</th><td>{row.model}</td><td>{row.baseline}</td><td>{number(row.sample)}</td>
    </tr>)}</tbody>
  </table></div>
}

export default function Backtest() {
  const { games, team, players } = evaluation
  return <div className="history-view">
    <p>{date(evaluation.from)} a {date(evaluation.to)} · {games} jogos em {evaluation.dates} dias · Box scores da {evaluation.source}</p>
    <section className="stat-tile">
      <h2>Projeções de equipe</h2>
      <Results rows={[
        { label: 'Erro médio de pontos por equipe', model: number(team.mae), baseline: number(team.baseMae), sample: games },
        { label: 'Erro médio do total do jogo', model: number(team.total), baseline: number(team.baseTotal), sample: games },
        { label: 'Acerto do vencedor', model: percent(team.winner), baseline: percent(team.baseWinner), sample: games },
        { label: 'Erro de probabilidade de vitória (Brier)', model: number(team.brier), baseline: number(team.homeBrier), sample: games }
      ]}/>
      <p>A referência de placar combina a média de pontos marcados pela equipe e a média de pontos cedidos pelo adversário. Para o erro de probabilidade, a referência é 50% para o mandante. Erros menores são melhores.</p>
    </section>
    <section className="stat-tile">
      <h2>Erro médio por estatística de jogador</h2>
      <Results rows={(Object.keys(labels) as (keyof typeof labels)[]).map(key => ({
        label: labels[key], model: number(players[key].model), baseline: number(players[key].baseline), sample: players[key].n
      }))}/>
      <p>A referência é a média pré-jogo do próprio jogador. A amostra inclui atletas com histórico suficiente que entraram em quadra, inclusive os que jogaram menos de 12 minutos.</p>
    </section>
    <details className="stat-tile history-audit">
      <summary>Metodologia e versão do motor</summary>
      <p>Cada partida foi projetada com os jogos finalizados antes da data do confronto. O replay mede o cálculo de equipe e a projeção individual. A amostra disponível não inclui boletins de lesões congelados, nem mede a triagem do Radar ou resultados por limite.</p>
      <p>Motor de equipes <code>{evaluation.modelSha256.slice(0, 12)}</code> · Motor individual <code>{evaluation.radarSha256.slice(0, 12)}</code></p>
    </details>
  </div>
}
