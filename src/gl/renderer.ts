import type { ViewRect } from '../core/types'
import { niceTicks } from '../core/ticks'

export const TRAIL_SLOTS = 44

/** Inner margin (CSS/device pixels) reserved for tick labels around the plot. */
export const PLOT_MARGIN = 38

const FLOATS_PER_TRAIL_VERTEX = 5

export interface Projection {
  pxPerUnit: number
  centerX: number
  centerY: number
  plotLeft: number
  plotTop: number
  plotRight: number
  plotBottom: number
  width: number
  height: number
}

export function projectionFor(
  view: ViewRect,
  width: number,
  height: number,
  margin = PLOT_MARGIN,
): Projection {
  const xRange = Math.max(1e-9, view.xMax - view.xMin)
  const yRange = Math.max(1e-9, view.yMax - view.yMin)
  const safeWidth = Math.max(1, width)
  const safeHeight = Math.max(1, height)
  const usableWidth = Math.max(1, safeWidth - 2 * margin)
  const usableHeight = Math.max(1, safeHeight - 2 * margin)
  const pxPerUnit = Math.max(1e-9, Math.min(usableWidth / xRange, usableHeight / yRange))
  const centerX = (view.xMin + view.xMax) / 2
  const centerY = (view.yMin + view.yMax) / 2
  const plotWidth = xRange * pxPerUnit
  const plotHeight = yRange * pxPerUnit
  const plotLeft = (safeWidth - plotWidth) / 2
  const plotTop = (safeHeight - plotHeight) / 2
  return {
    pxPerUnit,
    centerX,
    centerY,
    plotLeft,
    plotTop,
    plotRight: plotLeft + plotWidth,
    plotBottom: plotTop + plotHeight,
    width: safeWidth,
    height: safeHeight,
  }
}

export function worldToScreen(projection: Projection, x: number, y: number): [number, number] {
  return [
    projection.width / 2 + (x - projection.centerX) * projection.pxPerUnit,
    projection.height / 2 - (y - projection.centerY) * projection.pxPerUnit,
  ]
}

export function screenToWorld(projection: Projection, x: number, y: number): [number, number] {
  return [
    projection.centerX + (x - projection.width / 2) / projection.pxPerUnit,
    projection.centerY - (y - projection.height / 2) / projection.pxPerUnit,
  ]
}

interface DisplayOptions {
  mode: 'live' | 'portrait'
  showField: boolean
  showArrows: boolean
  showTrails: boolean
}

interface ProgramBundle {
  program: WebGLProgram
  uniforms: Record<string, WebGLUniformLocation | null>
}

const PALETTE = `
vec3 palette(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c0 = vec3(0.012, 0.014, 0.060);
  vec3 c1 = vec3(0.125, 0.045, 0.310);
  vec3 c2 = vec3(0.480, 0.100, 0.470);
  vec3 c3 = vec3(0.860, 0.280, 0.290);
  vec3 c4 = vec3(0.990, 0.660, 0.190);
  vec3 c5 = vec3(1.000, 0.960, 0.640);
  vec3 color = mix(c0, c1, smoothstep(0.00, 0.22, t));
  color = mix(color, c2, smoothstep(0.20, 0.45, t));
  color = mix(color, c3, smoothstep(0.43, 0.68, t));
  color = mix(color, c4, smoothstep(0.66, 0.87, t));
  color = mix(color, c5, smoothstep(0.86, 1.00, t));
  return color;
}

// Orbits get a cool floor so that very low-energy trajectories do not vanish
// into the dark background.
vec3 orbitColor(float t) {
  return mix(vec3(0.20, 0.28, 0.52), palette(t), 0.84) * 1.08;
}
`

const BACKGROUND_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_uv;
uniform vec4 u_rect;
out vec2 v_uv;
void main() {
  vec2 position = vec2(mix(u_rect.x, u_rect.z, a_uv.x), mix(u_rect.y, u_rect.w, a_uv.y));
  gl_Position = vec4(position, 0.0, 1.0);
  v_uv = a_uv;
}
`

const BACKGROUND_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_energy;
out vec4 outColor;
${PALETTE}
void main() {
  float t = texture(u_energy, v_uv).r;
  vec3 base = palette(t);
  float luma = dot(base, vec3(0.299, 0.587, 0.114));
  vec3 cool = vec3(0.58, 0.70, 1.0) * luma;
  vec3 color = mix(cool, base, 0.58) * 0.33;
  color += vec3(0.004, 0.007, 0.016);
  float bands = abs(fract(t * 22.0) - 0.5) * 2.0;
  float contour = smoothstep(0.93, 1.0, bands);
  color += contour * vec3(0.032, 0.042, 0.062);
  color *= 0.92 + 0.14 * (1.0 - v_uv.y);
  outColor = vec4(color, 1.0);
}
`

const LINE_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_pos;
layout(location = 1) in float a_u;
layout(location = 2) in float a_slot;
layout(location = 3) in float a_valid;
layout(location = 4) in float a_alpha;
uniform vec2 u_center;
uniform vec2 u_scale;
uniform float u_trails;
uniform float u_head;
uniform float u_slots;
uniform float u_alpha;
out vec3 v_color;
out float v_alpha;
${PALETTE}
void main() {
  gl_Position = vec4((a_pos - u_center) * u_scale, 0.0, 1.0);
  float age = mod(u_head - a_slot + u_slots, u_slots) / u_slots;
  float fade = mix(1.0, pow(1.0 - age, 1.65), u_trails);
  v_color = orbitColor(a_u);
  v_alpha = a_alpha * fade * a_valid * u_alpha;
}
`

const LINE_FS = `#version 300 es
precision highp float;
in vec3 v_color;
in float v_alpha;
out vec4 outColor;
void main() {
  if (v_alpha <= 0.002) discard;
  outColor = vec4(v_color, v_alpha);
}
`

const POINT_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_pos;
layout(location = 1) in float a_u;
uniform vec2 u_center;
uniform vec2 u_scale;
uniform float u_size;
out vec3 v_color;
${PALETTE}
void main() {
  gl_Position = vec4((a_pos - u_center) * u_scale, 0.0, 1.0);
  gl_PointSize = u_size;
  v_color = orbitColor(a_u) * 1.12;
}
`

const POINT_FS = `#version 300 es
precision highp float;
in vec3 v_color;
out vec4 outColor;
void main() {
  float radius = length(gl_PointCoord - 0.5);
  float alpha = 1.0 - smoothstep(0.10, 0.5, radius);
  if (alpha <= 0.0) discard;
  outColor = vec4(v_color, alpha * 0.9);
}
`

const OVERLAY_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_pos;
layout(location = 1) in float a_alpha;
uniform vec2 u_center;
uniform vec2 u_scale;
out float v_alpha;
void main() {
  gl_Position = vec4((a_pos - u_center) * u_scale, 0.0, 1.0);
  v_alpha = a_alpha;
}
`

const OVERLAY_FS = `#version 300 es
precision highp float;
in float v_alpha;
uniform vec3 u_color;
out vec4 outColor;
void main() {
  outColor = vec4(u_color, v_alpha);
}
`

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Could not create WebGL shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`WebGL shader compilation failed: ${log ?? 'unknown error'}`)
  }
  return shader
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
  uniformNames: string[],
): ProgramBundle {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource)
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource)
  const program = gl.createProgram()
  if (!program) throw new Error('Could not create WebGL program')
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program)
    gl.deleteProgram(program)
    throw new Error(`WebGL program link failed: ${log ?? 'unknown error'}`)
  }
  const uniforms: Record<string, WebGLUniformLocation | null> = {}
  for (const name of uniformNames) uniforms[name] = gl.getUniformLocation(program, name)
  return { program, uniforms }
}

interface AttributeSpec {
  location: number
  size: number
  offset: number
}

function createVertexArray(
  gl: WebGL2RenderingContext,
  buffer: WebGLBuffer,
  strideFloats: number,
  attributes: AttributeSpec[],
  constants: Array<[number, number]> = [],
): WebGLVertexArrayObject {
  const vao = gl.createVertexArray()
  if (!vao) throw new Error('Could not create WebGL vertex array')
  gl.bindVertexArray(vao)
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  const stride = strideFloats * 4
  for (const attribute of attributes) {
    gl.enableVertexAttribArray(attribute.location)
    gl.vertexAttribPointer(attribute.location, attribute.size, gl.FLOAT, false, stride, attribute.offset * 4)
  }
  for (const [location, value] of constants) {
    gl.disableVertexAttribArray(location)
    gl.vertexAttrib1f(location, value)
  }
  gl.bindVertexArray(null)
  return vao
}

export class PhaseRenderer {
  private readonly gl: WebGL2RenderingContext
  private readonly canvas: HTMLCanvasElement
  private view: ViewRect = { xMin: -3, xMax: 3, yMin: -3, yMax: 3 }
  private display: DisplayOptions = { mode: 'live', showField: true, showArrows: true, showTrails: true }

  private readonly background: ProgramBundle
  private readonly lines: ProgramBundle
  private readonly points: ProgramBundle
  private readonly overlay: ProgramBundle

  private readonly quadBuffer: WebGLBuffer
  private readonly quadVao: WebGLVertexArrayObject

  private readonly gridBuffer: WebGLBuffer
  private readonly gridVao: WebGLVertexArrayObject
  private gridCount = 0

  private readonly trailBuffer: WebGLBuffer
  private readonly trailVao: WebGLVertexArrayObject
  private readonly portraitBuffer: WebGLBuffer
  private readonly portraitVao: WebGLVertexArrayObject
  private readonly arrowBuffer: WebGLBuffer
  private readonly arrowVao: WebGLVertexArrayObject
  private readonly positionBuffer: WebGLBuffer
  private readonly colorBuffer: WebGLBuffer
  private readonly pointVao: WebGLVertexArrayObject

  private fieldTexture: WebGLTexture | null = null

  private liveCount = 0
  private liveColors: Float32Array = new Float32Array(0)
  private liveScratch: Float32Array = new Float32Array(0)
  private prevPositions: Float32Array | null = null
  private segmentCount = 0
  private lastSlot = 0
  private hasPoints = false

  private portraitCount = 0
  private arrowCount = 0
  private disposed = false

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const gl = canvas.getContext('webgl2', {
      antialias: true,
      alpha: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    })
    if (!gl) throw new Error('This browser does not support WebGL2')
    this.gl = gl

    this.background = createProgram(gl, BACKGROUND_VS, BACKGROUND_FS, ['u_rect', 'u_energy'])
    this.lines = createProgram(gl, LINE_VS, LINE_FS, [
      'u_center',
      'u_scale',
      'u_trails',
      'u_head',
      'u_slots',
      'u_alpha',
    ])
    this.points = createProgram(gl, POINT_VS, POINT_FS, ['u_center', 'u_scale', 'u_size'])
    this.overlay = createProgram(gl, OVERLAY_VS, OVERLAY_FS, ['u_center', 'u_scale', 'u_color'])

    this.quadBuffer = this.makeBuffer(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW)
    this.quadVao = createVertexArray(gl, this.quadBuffer, 2, [{ location: 0, size: 2, offset: 0 }])

    this.gridBuffer = this.makeBuffer(0, gl.DYNAMIC_DRAW)
    this.gridVao = createVertexArray(gl, this.gridBuffer, 3, [
      { location: 0, size: 2, offset: 0 },
      { location: 1, size: 1, offset: 2 },
    ])

    this.trailBuffer = this.makeBuffer(0, gl.DYNAMIC_DRAW)
    this.trailVao = createVertexArray(
      gl,
      this.trailBuffer,
      FLOATS_PER_TRAIL_VERTEX,
      [
        { location: 0, size: 2, offset: 0 },
        { location: 1, size: 1, offset: 2 },
        { location: 2, size: 1, offset: 3 },
        { location: 3, size: 1, offset: 4 },
      ],
      [[4, 1]],
    )

    this.portraitBuffer = this.makeBuffer(0, gl.DYNAMIC_DRAW)
    this.portraitVao = createVertexArray(
      gl,
      this.portraitBuffer,
      3,
      [
        { location: 0, size: 2, offset: 0 },
        { location: 1, size: 1, offset: 2 },
      ],
      [
        [2, 0],
        [3, 1],
        [4, 1],
      ],
    )

    this.arrowBuffer = this.makeBuffer(0, gl.DYNAMIC_DRAW)
    this.arrowVao = createVertexArray(
      gl,
      this.arrowBuffer,
      3,
      [
        { location: 0, size: 2, offset: 0 },
        { location: 1, size: 1, offset: 2 },
      ],
      [
        [2, 0],
        [3, 1],
        [4, 1],
      ],
    )

    this.positionBuffer = this.makeBuffer(0, gl.DYNAMIC_DRAW)
    this.colorBuffer = this.makeBuffer(0, gl.STATIC_DRAW)
    this.pointVao = gl.createVertexArray()
    if (!this.pointVao) throw new Error('Could not create WebGL vertex array')
    gl.bindVertexArray(this.pointVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0)
    gl.bindVertexArray(null)

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.disable(gl.DEPTH_TEST)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    this.resize()
    this.rebuildGrid()
  }

  private makeBuffer(data: BufferSource | number, usage: number): WebGLBuffer {
    const gl = this.gl
    const buffer = gl.createBuffer()
    if (!buffer) throw new Error('Could not create WebGL buffer')
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    if (typeof data === 'number') {
      gl.bufferData(gl.ARRAY_BUFFER, data, usage)
    } else {
      gl.bufferData(gl.ARRAY_BUFFER, data, usage)
    }
    return buffer
  }

  resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * dpr))
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * dpr))
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
    }
  }

  setView(view: ViewRect): void {
    if (
      view.xMin === this.view.xMin &&
      view.xMax === this.view.xMax &&
      view.yMin === this.view.yMin &&
      view.yMax === this.view.yMax
    ) {
      return
    }
    this.view = view
    this.rebuildGrid()
  }

  setDisplay(display: Partial<DisplayOptions>): void {
    this.display = { ...this.display, ...display }
  }

  setField(textureData: Uint8Array | null, width: number, height: number): void {
    const gl = this.gl
    if (!textureData || width <= 0 || height <= 0) {
      if (this.fieldTexture) {
        gl.deleteTexture(this.fieldTexture)
        this.fieldTexture = null
      }
      return
    }
    if (!this.fieldTexture) {
      this.fieldTexture = gl.createTexture()
      if (!this.fieldTexture) throw new Error('Could not create WebGL texture')
    }
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTexture)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, width, height, 0, gl.RED, gl.UNSIGNED_BYTE, textureData)
  }

  setArrows(arrows: Float32Array | null, vertexCount: number): void {
    const gl = this.gl
    gl.bindBuffer(gl.ARRAY_BUFFER, this.arrowBuffer)
    if (!arrows || vertexCount <= 0) {
      gl.bufferData(gl.ARRAY_BUFFER, 0, gl.DYNAMIC_DRAW)
      this.arrowCount = 0
      return
    }
    gl.bufferData(gl.ARRAY_BUFFER, arrows, gl.DYNAMIC_DRAW)
    this.arrowCount = Math.min(vertexCount, Math.floor(arrows.length / 3))
  }

  setPortrait(data: Float32Array | null, vertexCount: number): void {
    const gl = this.gl
    gl.bindBuffer(gl.ARRAY_BUFFER, this.portraitBuffer)
    if (!data || vertexCount <= 0) {
      gl.bufferData(gl.ARRAY_BUFFER, 0, gl.DYNAMIC_DRAW)
      this.portraitCount = 0
      return
    }
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
    this.portraitCount = Math.min(vertexCount, Math.floor(data.length / 3))
  }

  clearPortrait(): void {
    this.setPortrait(null, 0)
  }

  initializeLive(count: number, colors: Float32Array): void {
    const gl = this.gl
    if (count <= 0 || colors.length < count) {
      this.clearLive()
      return
    }
    this.liveCount = count
    this.liveColors = colors
    this.liveScratch = new Float32Array(count * 2 * FLOATS_PER_TRAIL_VERTEX)
    this.prevPositions = null
    this.segmentCount = 0
    this.lastSlot = 0
    this.hasPoints = false

    gl.bindBuffer(gl.ARRAY_BUFFER, this.trailBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, TRAIL_SLOTS * count * 2 * FLOATS_PER_TRAIL_VERTEX * 4, gl.DYNAMIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, count * 2 * 4, gl.DYNAMIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, colors.subarray(0, count), gl.STATIC_DRAW)
  }

  clearLive(): void {
    this.liveCount = 0
    this.liveColors = new Float32Array(0)
    this.liveScratch = new Float32Array(0)
    this.prevPositions = null
    this.segmentCount = 0
    this.lastSlot = 0
    this.hasPoints = false
  }

  clearTrails(): void {
    this.prevPositions = null
    this.segmentCount = 0
    this.lastSlot = 0
    this.hasPoints = false
  }

  pushSnapshot(positions: Float32Array, respawned?: Uint8Array): void {
    if (this.liveCount <= 0 || positions.length < this.liveCount * 2) return
    const gl = this.gl
    const count = this.liveCount

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, positions.subarray(0, count * 2))
    this.hasPoints = true

    if (this.prevPositions) {
      const previous = this.prevPositions
      const scratch = this.liveScratch
      const colors = this.liveColors
      const xRange = Math.max(1e-9, this.view.xMax - this.view.xMin)
      const yRange = Math.max(1e-9, this.view.yMax - this.view.yMin)
      const maxJump = 2.5 * Math.hypot(xRange, yRange)
      const maxJumpSquared = maxJump * maxJump
      const slot = this.segmentCount % TRAIL_SLOTS

      for (let particle = 0; particle < count; particle += 1) {
        const x0 = previous[2 * particle]
        const y0 = previous[2 * particle + 1]
        const x1 = positions[2 * particle]
        const y1 = positions[2 * particle + 1]
        const dx = x1 - x0
        const dy = y1 - y0
        let valid = 1
        if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) {
          valid = 0
        } else if (dx * dx + dy * dy > maxJumpSquared) {
          valid = 0
        } else if (respawned && respawned[particle]) {
          valid = 0
        }
        const base = particle * 2 * FLOATS_PER_TRAIL_VERTEX
        const color = colors[particle] ?? 0.5
        scratch[base] = x0
        scratch[base + 1] = y0
        scratch[base + 2] = color
        scratch[base + 3] = slot
        scratch[base + 4] = valid
        scratch[base + 5] = x1
        scratch[base + 6] = y1
        scratch[base + 7] = color
        scratch[base + 8] = slot
        scratch[base + 9] = valid
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, this.trailBuffer)
      gl.bufferSubData(gl.ARRAY_BUFFER, slot * scratch.length * 4, scratch)
      this.segmentCount += 1
      this.lastSlot = slot
      this.prevPositions.set(positions.subarray(0, count * 2))
    } else {
      this.prevPositions = positions.slice(0, count * 2)
    }
  }

  render(): void {
    if (this.disposed) return
    const gl = this.gl
    const width = this.canvas.width
    const height = this.canvas.height
    gl.viewport(0, 0, width, height)
    gl.clearColor(0.006, 0.009, 0.020, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)

    const dpr = width / Math.max(1, this.canvas.clientWidth)
    const projection = projectionFor(this.view, width, height, PLOT_MARGIN * dpr)
    const scaleX = (2 * projection.pxPerUnit) / width
    const scaleY = (2 * projection.pxPerUnit) / height
    const centerX = projection.centerX
    const centerY = projection.centerY

    if (this.display.showField && this.fieldTexture) {
      gl.disable(gl.BLEND)
      gl.useProgram(this.background.program)
      gl.bindVertexArray(this.quadVao)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.fieldTexture)
      gl.uniform1i(this.background.uniforms.u_energy, 0)
      const x0 = (this.view.xMin - centerX) * scaleX
      const x1 = (this.view.xMax - centerX) * scaleX
      const y0 = (this.view.yMin - centerY) * scaleY
      const y1 = (this.view.yMax - centerY) * scaleY
      gl.uniform4f(this.background.uniforms.u_rect, x0, y0, x1, y1)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      gl.enable(gl.BLEND)
    }

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    // Grid and axes
    if (this.gridCount > 0) {
      gl.useProgram(this.overlay.program)
      gl.bindVertexArray(this.gridVao)
      gl.uniform2f(this.overlay.uniforms.u_center, centerX, centerY)
      gl.uniform2f(this.overlay.uniforms.u_scale, scaleX, scaleY)
      gl.uniform3f(this.overlay.uniforms.u_color, 0.62, 0.74, 0.98)
      gl.drawArrays(gl.LINES, 0, this.gridCount)
    }

    gl.useProgram(this.lines.program)
    gl.uniform2f(this.lines.uniforms.u_center, centerX, centerY)
    gl.uniform2f(this.lines.uniforms.u_scale, scaleX, scaleY)
    gl.uniform1f(this.lines.uniforms.u_slots, TRAIL_SLOTS)

    if (this.display.mode === 'portrait' && this.portraitCount > 0) {
      gl.uniform1f(this.lines.uniforms.u_trails, 0)
      gl.uniform1f(this.lines.uniforms.u_head, 0)
      gl.uniform1f(this.lines.uniforms.u_alpha, 1)
      gl.bindVertexArray(this.portraitVao)
      gl.drawArrays(gl.LINES, 0, this.portraitCount)
    }

    if (this.display.mode === 'live') {
      if (this.display.showArrows && this.arrowCount > 0) {
        gl.uniform1f(this.lines.uniforms.u_trails, 0)
        gl.uniform1f(this.lines.uniforms.u_head, 0)
        gl.uniform1f(this.lines.uniforms.u_alpha, 0.62)
        gl.bindVertexArray(this.arrowVao)
        gl.drawArrays(gl.LINES, 0, this.arrowCount)
      }
      if (this.display.showTrails && this.segmentCount > 0 && this.liveCount > 0) {
        const segments = Math.min(this.segmentCount, TRAIL_SLOTS)
        gl.uniform1f(this.lines.uniforms.u_trails, 1)
        gl.uniform1f(this.lines.uniforms.u_head, this.lastSlot)
        gl.uniform1f(this.lines.uniforms.u_slots, TRAIL_SLOTS)
        gl.uniform1f(this.lines.uniforms.u_alpha, 0.95)
        gl.bindVertexArray(this.trailVao)
        gl.drawArrays(gl.LINES, 0, segments * this.liveCount * 2)
      }
      if (this.hasPoints && this.liveCount > 0) {
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
        gl.useProgram(this.points.program)
        gl.bindVertexArray(this.pointVao)
        gl.uniform2f(this.points.uniforms.u_center, centerX, centerY)
        gl.uniform2f(this.points.uniforms.u_scale, scaleX, scaleY)
        const dpr = Math.min(2, window.devicePixelRatio || 1)
        gl.uniform1f(this.points.uniforms.u_size, 2.6 * dpr)
        gl.drawArrays(gl.POINTS, 0, this.liveCount)
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
      }
    }

  }

  private rebuildGrid(): void {
    const gl = this.gl
    const { xMin, xMax, yMin, yMax } = this.view
    const xTicks = niceTicks(xMin, xMax, 9)
    const yTicks = niceTicks(yMin, yMax, 7)
    const vertices: number[] = []
    const pushLine = (x1: number, y1: number, x2: number, y2: number, alpha: number): void => {
      vertices.push(x1, y1, alpha, x2, y2, alpha)
    }
    for (const x of xTicks.values) pushLine(x, yMin, x, yMax, 0.055)
    for (const y of yTicks.values) pushLine(xMin, y, xMax, y, 0.055)
    if (xMin < 0 && xMax > 0) pushLine(0, yMin, 0, yMax, 0.28)
    if (yMin < 0 && yMax > 0) pushLine(xMin, 0, xMax, 0, 0.28)
    pushLine(xMin, yMin, xMax, yMin, 0.16)
    pushLine(xMax, yMin, xMax, yMax, 0.16)
    pushLine(xMax, yMax, xMin, yMax, 0.16)
    pushLine(xMin, yMax, xMin, yMin, 0.16)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.gridBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW)
    this.gridCount = vertices.length / 3
  }

  getProjection(): Projection {
    const width = this.canvas.clientWidth || this.canvas.width
    const height = this.canvas.clientHeight || this.canvas.height
    return projectionFor(this.view, width, height)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    const gl = this.gl
    if (this.fieldTexture) gl.deleteTexture(this.fieldTexture)
    for (const buffer of [
      this.quadBuffer,
      this.gridBuffer,
      this.trailBuffer,
      this.portraitBuffer,
      this.arrowBuffer,
      this.positionBuffer,
      this.colorBuffer,
    ]) {
      gl.deleteBuffer(buffer)
    }
    for (const vao of [
      this.quadVao,
      this.gridVao,
      this.trailVao,
      this.portraitVao,
      this.arrowVao,
      this.pointVao,
    ]) {
      gl.deleteVertexArray(vao)
    }
    for (const bundle of [this.background, this.lines, this.points, this.overlay]) {
      gl.deleteProgram(bundle.program)
    }
  }
}
