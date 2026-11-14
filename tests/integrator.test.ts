import { describe, expect, it } from 'vitest'
import { makeRk4Workspace, rk4Step } from '../src/core/integrator'
import { compileSystem } from '../src/core/system'

function run(
  kind: 'hamiltonian' | 'lagrangian',
  expression: string,
  initial: number[],
  steps: number,
  dt: number,
): { drift: number; state: Float64Array } {
  const system = compileSystem({ kind, dof: 1, expression, params: {} })
  const state = new Float64Array(initial)
  const work = makeRk4Workspace(system.dim)
  const initialEnergy = system.energy(state)
  for (let i = 0; i < steps; i += 1) {
    if (!rk4Step(system, state, 0, dt, work)) throw new Error('integrator diverged')
  }
  const finalEnergy = system.energy(state)
  return { drift: Math.abs((finalEnergy - initialEnergy) / initialEnergy), state }
}

describe('RK4', () => {
  it('conserves harmonic oscillator energy to high accuracy', () => {
    const { drift, state } = run('hamiltonian', '(p^2 + q^2)/2', [1, 0], 20000, 0.01)
    expect(drift).toBeLessThan(1e-8)
    expect(state[0]).toBeCloseTo(Math.cos(200), 5)
    expect(state[1]).toBeCloseTo(-Math.sin(200), 5)
  })

  it('conserves pendulum energy', () => {
    const { drift } = run('hamiltonian', 'p^2/2 + 1 - cos(q)', [1.1, 0], 20000, 0.005)
    expect(drift).toBeLessThan(1e-9)
  })

  it('conserves energy for the Lagrangian pendulum', () => {
    const { drift } = run('lagrangian', 'v^2/2 + cos(q)', [1.1, 0], 20000, 0.005)
    expect(drift).toBeLessThan(1e-9)
  })

  it('reports a non-finite step instead of pretending to succeed', () => {
    const system = compileSystem({
      kind: 'hamiltonian',
      dof: 1,
      expression: 'p^2/2 + 1/q',
      params: {},
    })
    const state = new Float64Array([0, 0])
    const work = makeRk4Workspace(system.dim)
    expect(rk4Step(system, state, 0, 0.1, work)).toBe(false)
  })
})
