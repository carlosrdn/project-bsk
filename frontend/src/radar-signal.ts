export function isRadarSignal({ projection, line, side, probability, sample }: {
  projection: number
  line: number
  side: string
  probability: number
  sample: number
}) {
  if (!Number.isFinite(projection) || projection < 0.05 ||
      !Number.isFinite(line) || line < 0.5 || line % 1 !== 0.5 ||
      !Number.isFinite(probability) || probability < 0.65 || probability > 1 ||
      !Number.isInteger(sample) || sample < 12) return false

  const distance = projection - line
  return (side === 'Acima' && distance >= 0.5) || (side === 'Abaixo' && distance <= -0.5)
}
