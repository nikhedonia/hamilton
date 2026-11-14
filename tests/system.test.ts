import { describe, expect, it } from 'vitest'
import { compileSystem } from '../src/core/system'

function derivative(kind: 'hamiltonian' | 'lagrangian', expression: string, state: number[], dof: 1 | 2 = 1, params = {}) {
  const system = compileSystem({ kind, dof, expression, params })
  const values = new Float64Array(state)
  const out = new Float64Array(system.dim)
  system.deriv(values, out)
  return { system, values, out }
}

describe('Hamiltonian systems', () => {
  it('implements the harmonic oscillator flow', () => {
    const { out, system } = derivative('hamiltonian', '(p^2 + q^2)/2', [1, 2])
    expect(out[0]).toBeCloseTo(2, 12)
    expect(out[1]).toBeCloseTo(-1, 12)
    expect(system.energy(new Float64Array([1, 2]))).toBeCloseTo(2.5, 12)
  })

  it('implements the pendulum flow', () => {
    const { out } = derivative('hamiltonian', 'p^2/2 + 1 - cos(q)', [0.3, 0.2])
    expect(out[0]).toBeCloseTo(0.2, 12)
    expect(out[1]).toBeCloseTo(-Math.sin(0.3), 12)
  })

  it('implements a 2D coupled flow', () => {
    const expression = '(p1^2+p2^2)/2 + (q1^2+q2^2)/2 + k*(q1-q2)^2/2'
    const { out } = derivative('hamiltonian', expression, [1, 0.2, -0.5, 0.3], 2, { k: 0.8 })
    expect(out[0]).toBeCloseTo(0.2, 12)
    expect(out[1]).toBeCloseTo(-2.2, 12)
    expect(out[2]).toBeCloseTo(0.3, 12)
    expect(out[3]).toBeCloseTo(1.7, 12)
  })

  it('implements Henon-Heiles', () => {
    const expression = '(p1^2+p2^2)/2 + (q1^2+q2^2)/2 + q1^2*q2 - q2^3/3'
    const { out } = derivative('hamiltonian', expression, [0.4, 0.5, -0.3, 0.2], 2)
    expect(out[0]).toBeCloseTo(0.5, 12)
    expect(out[1]).toBeCloseTo(-(0.4 + 2 * 0.4 * -0.3), 12)
    expect(out[2]).toBeCloseTo(0.2, 12)
    expect(out[3]).toBeCloseTo(-(-0.3 + 0.4 * 0.4 - (-0.3) * (-0.3)), 12)
  })
})

describe('Lagrangian systems', () => {
  it('reproduces the pendulum acceleration', () => {
    const { out, system } = derivative('lagrangian', 'v^2/2 + cos(q)', [0.7, 0.4])
    expect(out[0]).toBeCloseTo(0.4, 12)
    expect(out[1]).toBeCloseTo(-Math.sin(0.7), 12)
    expect(system.energy(new Float64Array([0.7, 0.4]))).toBeCloseTo(0.08 - Math.cos(0.7), 12)
  })

  it('reproduces the double well acceleration', () => {
    const { out } = derivative('lagrangian', 'v^2/2 - q^4/4 + q^2/2', [0.6, 0.1])
    expect(out[1]).toBeCloseTo(0.6 - 0.6 ** 3, 12)
  })

  it('handles a position dependent mass and the mixed derivative term', () => {
    // L = (1 + q^2) v^2 / 2 - q^2 / 2
    // a = (-q - q v^2) / (1 + q^2)
    const q = 0.4
    const v = 0.9
    const { out } = derivative('lagrangian', '(1 + q^2)*v^2/2 - q^2/2', [q, v])
    expect(out[0]).toBeCloseTo(v, 12)
    expect(out[1]).toBeCloseTo((-q - q * v * v) / (1 + q * q), 12)
  })

  it('solves a 2D Euler-Lagrange system', () => {
    const expression = '(v1^2+v2^2)/2 - (q1^2+q2^2)/2 - k*(q1-q2)^2/2'
    const { out, system } = derivative('lagrangian', expression, [1, 0.1, -0.5, 0.2], 2, { k: 0.8 })
    expect(out[0]).toBeCloseTo(0.1, 12)
    expect(out[1]).toBeCloseTo(-2.2, 12)
    expect(out[2]).toBeCloseTo(0.2, 12)
    expect(out[3]).toBeCloseTo(1.7, 12)
    expect(system.energy(new Float64Array([1, 0.1, -0.5, 0.2]))).toBeCloseTo(
      0.5 * 0.01 + 0.5 * 0.04 + 0.5 * (1 + 0.25) + 0.4 * 2.25,
      12,
    )
  })
})
