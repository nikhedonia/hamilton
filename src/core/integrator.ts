import type { CompiledSystem } from './system'

export interface Rk4Workspace {
  y: Float64Array
  k1: Float64Array
  k2: Float64Array
  k3: Float64Array
  k4: Float64Array
}

export function makeRk4Workspace(dim: number): Rk4Workspace {
  return {
    y: new Float64Array(dim),
    k1: new Float64Array(dim),
    k2: new Float64Array(dim),
    k3: new Float64Array(dim),
    k4: new Float64Array(dim),
  }
}

/**
 * One classical fourth-order Runge-Kutta step, in place.
 *
 * The state lives at `offset` inside a larger buffer so that many independent
 * trajectories can share one allocation.  Returns false if the step produced a
 * non-finite state.
 */
export function rk4Step(
  system: CompiledSystem,
  state: Float64Array,
  offset: number,
  h: number,
  work: Rk4Workspace,
): boolean {
  const dim = system.dim
  const { y, k1, k2, k3, k4 } = work

  for (let i = 0; i < dim; i += 1) y[i] = state[offset + i]
  system.deriv(y, k1)

  const half = 0.5 * h
  for (let i = 0; i < dim; i += 1) y[i] = state[offset + i] + half * k1[i]
  system.deriv(y, k2)

  for (let i = 0; i < dim; i += 1) y[i] = state[offset + i] + half * k2[i]
  system.deriv(y, k3)

  for (let i = 0; i < dim; i += 1) y[i] = state[offset + i] + h * k3[i]
  system.deriv(y, k4)

  const scale = h / 6
  for (let i = 0; i < dim; i += 1) {
    const next = state[offset + i] + scale * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])
    if (!Number.isFinite(next)) return false
    state[offset + i] = next
  }
  return true
}
