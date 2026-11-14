import { describe, expect, it } from 'vitest'
import { PRESETS } from '../src/core/presets'
import { compileSystem } from '../src/core/system'
import { makeRk4Workspace, rk4Step } from '../src/core/integrator'

describe('built-in examples', () => {
  it('has unique ids', () => {
    expect(new Set(PRESETS.map((preset) => preset.id)).size).toBe(PRESETS.length)
  })

  for (const preset of PRESETS) {
    it(`compiles and conserves energy for ${preset.name}`, () => {
      const system = compileSystem({
        kind: preset.kind,
        dof: preset.dof,
        expression: preset.expression,
        params: preset.params,
      })
      expect(system.dim).toBe(preset.dof * 2)

      const { xMin, xMax, yMin, yMax } = preset.view
      const xRange = xMax - xMin
      const yRange = yMax - yMin
      const state = new Float64Array(system.dim)
      state[0] = (xMin + xMax) / 2 + 0.15 * xRange
      state[1] = 0.15 * yRange
      if (preset.dof === 2) {
        state[2] = 0.2 * xRange
        state[3] = 0.1 * yRange
      }

      const initialEnergy = system.energy(state)
      expect(Number.isFinite(initialEnergy)).toBe(true)

      // Every point used by the energy background must be in the domain.
      for (const [x, y] of [
        [xMin, yMin],
        [xMin, yMax],
        [xMax, yMin],
        [xMax, yMax],
      ]) {
        const corner = new Float64Array(system.dim)
        corner[0] = x
        corner[1] = y
        expect(Number.isFinite(system.energy(corner))).toBe(true)
      }

      const work = makeRk4Workspace(system.dim)
      for (let step = 0; step < 300; step += 1) {
        expect(rk4Step(system, state, 0, preset.dt, work)).toBe(true)
      }
      const finalEnergy = system.energy(state)
      expect(Number.isFinite(finalEnergy)).toBe(true)
      const drift = Math.abs((finalEnergy - initialEnergy) / Math.max(1e-6, Math.abs(initialEnergy)))
      // Leave a generous margin for the intentionally coarse preset steps.
      expect(drift).toBeLessThan(5e-3)
    })
  }
})
