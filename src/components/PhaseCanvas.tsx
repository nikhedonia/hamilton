import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { AxisSpec, LiveSettings, SimStats, SystemConfig, ViewRect } from '../core/types'
import { formatTick, niceTicks } from '../core/ticks'
import { projectionFor, worldToScreen, PhaseRenderer } from '../gl/renderer'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import type { WorkerRequest, WorkerResponse } from '../sim/messages'

export interface PhaseCanvasProps {
  config: SystemConfig
  axes: AxisSpec
  view: ViewRect
  onViewChange: (view: ViewRect) => void
  mode: 'live' | 'portrait'
  playing: boolean
  dt: number
  speed: number
  particleCount: number
  portraitSteps: number
  portraitSeeds: number
  showField: boolean
  showArrows: boolean
  showTrails: boolean
  runNonce: number
  onError: (message: string | null) => void
  onStats: (stats: SimStats | null) => void
  onPortraitProgress: (progress: number | null) => void
  onPortraitInfo: (info: { seedCount: number; segments: number } | null) => void
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function PhaseCanvas(props: PhaseCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<PhaseRenderer | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const fieldRequestRef = useRef(0)
  const portraitRequestRef = useRef(0)
  const liveCountRef = useRef(0)
  const lastStatsRef = useRef(0)
  const viewRef = useRef(props.view)
  viewRef.current = props.view
  const playingRef = useRef(props.playing)
  playingRef.current = props.playing
  const settingsRef = useRef({ dt: props.dt, speed: props.speed })
  settingsRef.current = { dt: props.dt, speed: props.speed }
  const viewChangeRef = useRef(props.onViewChange)
  viewChangeRef.current = props.onViewChange
  const callbacksRef = useRef({
    onError: props.onError,
    onStats: props.onStats,
    onPortraitProgress: props.onPortraitProgress,
    onPortraitInfo: props.onPortraitInfo,
  })
  callbacksRef.current = {
    onError: props.onError,
    onStats: props.onStats,
    onPortraitProgress: props.onPortraitProgress,
    onPortraitInfo: props.onPortraitInfo,
  }

  const [size, setSize] = useState({ width: 0, height: 0 })
  const [dragging, setDragging] = useState(false)
  const [fatal, setFatal] = useState<string | null>(null)
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; view: ViewRect } | null>(null)

  const debouncedConfig = useDebouncedValue(props.config, 200)
  const debouncedView = useDebouncedValue(props.view, 150)

  // Create the renderer + worker and run the render loop.
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    let renderer: PhaseRenderer
    try {
      renderer = new PhaseRenderer(canvas)
    } catch (error) {
      setFatal(error instanceof Error ? error.message : String(error))
      return
    }
    rendererRef.current = renderer
    renderer.setDisplay({
      mode: props.mode,
      showField: props.showField,
      showArrows: props.showArrows,
      showTrails: props.showTrails,
    })
    renderer.setView(viewRef.current)

    let worker: Worker
    try {
      worker = new Worker(new URL('../sim/sim.worker.ts', import.meta.url), { type: 'module' })
    } catch (error) {
      callbacksRef.current.onError(error instanceof Error ? error.message : String(error))
      renderer.dispose()
      rendererRef.current = null
      return
    }
    workerRef.current = worker

    const handleMessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data
      switch (message.type) {
        case 'field': {
          if (message.requestId !== fieldRequestRef.current) return
          renderer.setField(message.energy, message.width, message.height)
          renderer.setArrows(message.arrows, Math.floor(message.arrows.length / 3))
          callbacksRef.current.onError(null)
          break
        }
        case 'field-error': {
          if (message.requestId !== fieldRequestRef.current) return
          renderer.setField(null, 0, 0)
          renderer.setArrows(null, 0)
          renderer.clearLive()
          callbacksRef.current.onError(message.message)
          break
        }
        case 'live-seeded': {
          liveCountRef.current = message.count
          lastStatsRef.current = 0
          renderer.initializeLive(message.count, message.colors)
          callbacksRef.current.onStats(null)
          break
        }
        case 'live-snapshot': {
          renderer.pushSnapshot(message.positions, message.respawned)
          const now = performance.now()
          if (now - lastStatsRef.current > 180) {
            lastStatsRef.current = now
            callbacksRef.current.onStats({
              time: message.time,
              drift: message.drift,
              driftSpread: message.driftSpread,
              particles: liveCountRef.current,
              steps: message.steps,
            })
          }
          break
        }
        case 'live-error':
          renderer.clearLive()
          callbacksRef.current.onError(message.message)
          break
        case 'portrait': {
          if (message.requestId !== portraitRequestRef.current) return
          renderer.setPortrait(message.data, message.vertexCount)
          callbacksRef.current.onError(null)
          callbacksRef.current.onPortraitProgress(null)
          callbacksRef.current.onPortraitInfo({ seedCount: message.seedCount, segments: message.segments })
          break
        }
        case 'portrait-progress': {
          if (message.requestId !== portraitRequestRef.current) return
          callbacksRef.current.onPortraitProgress(message.progress)
          break
        }
        case 'portrait-error': {
          if (message.requestId !== portraitRequestRef.current) return
          callbacksRef.current.onError(message.message)
          callbacksRef.current.onPortraitProgress(null)
          callbacksRef.current.onPortraitInfo(null)
          break
        }
      }
    }
    worker.onmessage = handleMessage
    worker.onerror = (event) => {
      callbacksRef.current.onError(event.message || 'The simulation worker crashed')
    }

    const resizeObserver = new ResizeObserver(() => {
      renderer.resize()
      const rect = container.getBoundingClientRect()
      setSize((previous) =>
        previous.width === rect.width && previous.height === rect.height
          ? previous
          : { width: rect.width, height: rect.height },
      )
    })
    resizeObserver.observe(container)
    const rect = container.getBoundingClientRect()
    setSize({ width: rect.width, height: rect.height })
    renderer.resize()

    let animationFrame = 0
    const loop = () => {
      renderer.render()
      animationFrame = requestAnimationFrame(loop)
    }
    animationFrame = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
      worker.terminate()
      workerRef.current = null
      rendererRef.current = null
      renderer.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useLayoutEffect(() => {
    rendererRef.current?.setView(props.view)
  }, [props.view])

  useEffect(() => {
    rendererRef.current?.setDisplay({
      mode: props.mode,
      showField: props.showField,
      showArrows: props.showArrows,
      showTrails: props.showTrails,
    })
  }, [props.mode, props.showField, props.showArrows, props.showTrails])

  // Recompute the background field whenever the system or the viewport changes.
  useEffect(() => {
    const worker = workerRef.current
    if (!worker) return
    fieldRequestRef.current += 1
    const request: WorkerRequest = {
      type: 'field',
      requestId: fieldRequestRef.current,
      config: debouncedConfig,
      view: debouncedView,
      axes: props.axes,
      resolution: 320,
      arrowResolution: 25,
    }
    worker.postMessage(request)
  }, [debouncedConfig, debouncedView, props.axes])

  // Seed / reseed the live particle cloud.  Play and pause are handled below so
  // that pausing freezes the current state instead of throwing it away.
  useEffect(() => {
    const worker = workerRef.current
    if (!worker) return
    if (props.mode === 'live') {
      liveCountRef.current = 0
      lastStatsRef.current = 0
      rendererRef.current?.clearTrails()
      const settings: LiveSettings = {
        dt: settingsRef.current.dt,
        speed: settingsRef.current.speed,
        count: props.particleCount,
      }
      const request: WorkerRequest = {
        type: 'live-start',
        config: debouncedConfig,
        view: viewRef.current,
        axes: props.axes,
        settings,
        paused: !playingRef.current,
      }
      worker.postMessage(request)
    } else {
      worker.postMessage({ type: 'live-stop' })
    }
  }, [props.mode, debouncedConfig, props.axes, props.particleCount, props.runNonce])

  useEffect(() => {
    const worker = workerRef.current
    if (!worker || props.mode !== 'live') return
    worker.postMessage({ type: props.playing ? 'live-resume' : 'live-pause' })
  }, [props.playing, props.mode])

  useEffect(() => {
    const worker = workerRef.current
    if (!worker) return
    worker.postMessage({
      type: 'live-settings',
      settings: { dt: props.dt, speed: props.speed, count: props.particleCount },
    })
  }, [props.dt, props.speed, props.particleCount])

  useEffect(() => {
    const worker = workerRef.current
    if (!worker || props.mode !== 'live') return
    worker.postMessage({ type: 'live-view', view: debouncedView })
  }, [debouncedView, props.mode])

  // Compute the static phase portrait in portrait mode.
  useEffect(() => {
    const worker = workerRef.current
    if (!worker) return
    if (props.mode !== 'portrait') {
      portraitRequestRef.current += 1
      worker.postMessage({ type: 'cancel-portrait' })
      rendererRef.current?.clearPortrait()
      callbacksRef.current.onPortraitProgress(null)
      callbacksRef.current.onPortraitInfo(null)
      return
    }
    const xRange = Math.max(1e-9, debouncedView.xMax - debouncedView.xMin)
    const yRange = Math.max(1e-9, debouncedView.yMax - debouncedView.yMin)
    const target = clamp(props.portraitSeeds, 60, 2400)
    const cols = Math.round(clamp(Math.sqrt((target * xRange) / yRange), 6, 80))
    const rows = Math.round(clamp(Math.ceil(target / cols), 6, 80))
    portraitRequestRef.current += 1
    callbacksRef.current.onPortraitProgress(0)
    callbacksRef.current.onPortraitInfo(null)
    worker.postMessage({
      type: 'portrait',
      requestId: portraitRequestRef.current,
      config: debouncedConfig,
      view: debouncedView,
      axes: props.axes,
      steps: props.portraitSteps,
      seedCols: cols,
      seedRows: rows,
      dt: props.dt,
    })
  }, [
    props.mode,
    debouncedConfig,
    debouncedView,
    props.axes,
    props.portraitSteps,
    props.portraitSeeds,
    props.dt,
    props.runNonce,
  ])

  // Native wheel listener: React's onWheel is passive on some setups.
  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const projection = projectionFor(viewRef.current, rect.width, rect.height)
      const localX = event.clientX - rect.left
      const localY = event.clientY - rect.top
      const worldX = projection.centerX + (localX - rect.width / 2) / projection.pxPerUnit
      const worldY = projection.centerY - (localY - rect.height / 2) / projection.pxPerUnit
      const view = viewRef.current
      const factor = Math.exp(clamp(event.deltaY, -400, 400) * 0.0014)
      const xRange = (view.xMax - view.xMin) / factor
      const yRange = (view.yMax - view.yMin) / factor
      if (!Number.isFinite(xRange) || !Number.isFinite(yRange) || xRange < 1e-7 || yRange < 1e-7) return
      if (xRange > 1e8 || yRange > 1e8) return
      const fx = (worldX - view.xMin) / (view.xMax - view.xMin)
      const fy = (worldY - view.yMin) / (view.yMax - view.yMin)
      viewChangeRef.current({
        xMin: worldX - fx * xRange,
        xMax: worldX + (1 - fx) * xRange,
        yMin: worldY - fy * yRange,
        yMax: worldY + (1 - fy) * yRange,
      })
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [])

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      view: viewRef.current,
    }
    setDragging(true)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0 || rect.height <= 0) return
    const projection = projectionFor(drag.view, rect.width, rect.height)
    const dx = (event.clientX - drag.startX) / projection.pxPerUnit
    const dy = (event.clientY - drag.startY) / projection.pxPerUnit
    props.onViewChange({
      xMin: drag.view.xMin - dx,
      xMax: drag.view.xMax - dx,
      yMin: drag.view.yMin + dy,
      yMax: drag.view.yMax + dy,
    })
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragRef.current = null
    setDragging(false)
  }

  const projection = projectionFor(props.view, Math.max(1, size.width), Math.max(1, size.height))
  const xTicks = niceTicks(props.view.xMin, props.view.xMax, 9)
  const yTicks = niceTicks(props.view.yMin, props.view.yMax, 7)
  const showLabels = size.width > 120 && size.height > 120

  return (
    <div
      ref={containerRef}
      className={`phase-canvas${dragging ? ' is-dragging' : ''}`}
      tabIndex={0}
      role="application"
      aria-label="Phase space plot. Drag to pan, scroll to zoom."
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <canvas ref={canvasRef} className="phase-canvas__gl" />
      {showLabels && (
        <svg className="phase-canvas__labels" width={size.width} height={size.height} aria-hidden="true">
          <rect
            x={projection.plotLeft}
            y={projection.plotTop}
            width={Math.max(0, projection.plotRight - projection.plotLeft)}
            height={Math.max(0, projection.plotBottom - projection.plotTop)}
            fill="none"
            stroke="rgba(150, 190, 255, 0.18)"
            strokeWidth={1}
          />
          {xTicks.values.map((value) => {
            const [screenX] = worldToScreen(projection, value, props.view.yMin)
            if (screenX < projection.plotLeft + 12 || screenX > projection.plotRight - 12) return null
            return (
              <g key={`x-${value}`}>
                <line
                  x1={screenX}
                  x2={screenX}
                  y1={projection.plotBottom}
                  y2={projection.plotBottom + 4}
                  stroke="rgba(160, 200, 255, 0.3)"
                />
                <text
                  x={screenX}
                  y={projection.plotBottom + 16}
                  textAnchor="middle"
                  className="phase-canvas__tick"
                >
                  {formatTick(value, xTicks.step)}
                </text>
              </g>
            )
          })}
          {yTicks.values.map((value) => {
            const [, screenY] = worldToScreen(projection, props.view.xMin, value)
            if (screenY < projection.plotTop + 10 || screenY > projection.plotBottom - 10) return null
            return (
              <g key={`y-${value}`}>
                <line
                  x1={projection.plotLeft - 4}
                  x2={projection.plotLeft}
                  y1={screenY}
                  y2={screenY}
                  stroke="rgba(160, 200, 255, 0.3)"
                />
                <text
                  x={projection.plotLeft - 8}
                  y={screenY + 3}
                  textAnchor="end"
                  className="phase-canvas__tick"
                >
                  {formatTick(value, yTicks.step)}
                </text>
              </g>
            )
          })}
          <text
            x={projection.plotLeft + 8}
            y={projection.plotTop + 16}
            className="phase-canvas__axis-label"
            textAnchor="start"
          >
            {props.axes.yLabel}
          </text>
          <text
            x={projection.plotRight - 8}
            y={projection.plotBottom - 10}
            className="phase-canvas__axis-label"
            textAnchor="end"
          >
            {props.axes.xLabel}
          </text>
        </svg>
      )}
      {fatal && (
        <div className="phase-canvas__fatal">
          <strong>WebGL2 is unavailable</strong>
          <span>{fatal}</span>
        </div>
      )}
    </div>
  )
}
