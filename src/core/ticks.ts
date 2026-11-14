export interface TickSet {
  step: number
  values: number[]
}

function niceStep(range: number, target: number): number {
  if (!(range > 0) || !Number.isFinite(range)) return 1
  const rough = range / Math.max(1, target)
  const power = Math.pow(10, Math.floor(Math.log10(rough)))
  const fraction = rough / power
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return nice * power
}

export function niceTicks(min: number, max: number, target = 8): TickSet {
  if (!(max > min) || !Number.isFinite(min) || !Number.isFinite(max)) {
    return { step: 1, values: [] }
  }
  const step = niceStep(max - min, target)
  const epsilon = step * 1e-9
  const start = Math.ceil((min - epsilon) / step) * step
  const values: number[] = []
  for (let value = start; value <= max + epsilon; value += step) {
    values.push(Math.abs(value) < epsilon ? 0 : value)
    if (values.length > 200) break
  }
  return { step, values }
}

export function formatTick(value: number, step: number): string {
  if (value === 0) return '0'
  const magnitude = Math.abs(value)
  if (magnitude >= 100000 || magnitude < 0.001) return value.toExponential(1)
  const decimals = Math.max(0, Math.min(6, Math.ceil(-Math.log10(step)) + 1))
  const text = value.toFixed(decimals)
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text
}
