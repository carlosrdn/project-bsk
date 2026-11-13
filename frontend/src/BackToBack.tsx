export default function BackToBack({ active, player = false }: { active?: boolean; player?: boolean }) {
  if (!active) return null
  const description = player
    ? 'Atuou na rodada anterior e tem jogo hoje'
    : 'A equipe jogou na rodada anterior e tem jogo hoje'
  return <span className="back-to-back" aria-label={description} title={description}>B2B</span>
}
