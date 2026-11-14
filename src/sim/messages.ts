import type { AxisSpec, Dof, Kind, LiveSettings, SystemConfig, ViewRect } from '../core/types'

export interface FieldRequest {
  type: 'field'
  requestId: number
  config: SystemConfig
  view: ViewRect
  axes: AxisSpec
  resolution: number
  arrowResolution: number
}

export interface LiveStartRequest {
  type: 'live-start'
  config: SystemConfig
  view: ViewRect
  axes: AxisSpec
  settings: LiveSettings
  paused: boolean
}

export interface LivePauseRequest {
  type: 'live-pause'
}

export interface LiveResumeRequest {
  type: 'live-resume'
}

export interface LiveStopRequest {
  type: 'live-stop'
}

export interface LiveViewRequest {
  type: 'live-view'
  view: ViewRect
}

export interface LiveSettingsRequest {
  type: 'live-settings'
  settings: LiveSettings
}

export interface PortraitRequest {
  type: 'portrait'
  requestId: number
  config: SystemConfig
  view: ViewRect
  axes: AxisSpec
  steps: number
  seedCols: number
  seedRows: number
  dt: number
}

export interface CancelPortraitRequest {
  type: 'cancel-portrait'
}

export type WorkerRequest =
  | FieldRequest
  | LiveStartRequest
  | LivePauseRequest
  | LiveResumeRequest
  | LiveStopRequest
  | LiveViewRequest
  | LiveSettingsRequest
  | PortraitRequest
  | CancelPortraitRequest

export interface FieldResponse {
  type: 'field'
  requestId: number
  width: number
  height: number
  energy: Uint8Array
  eMin: number
  eMax: number
  arrows: Float32Array
}

export interface FieldErrorResponse {
  type: 'field-error'
  requestId: number
  message: string
}

export interface LiveSeededResponse {
  type: 'live-seeded'
  count: number
  colors: Float32Array
  dim: number
  kind: Kind
  dof: Dof
}

export interface LiveSnapshotResponse {
  type: 'live-snapshot'
  positions: Float32Array
  respawned: Uint8Array
  time: number
  drift: number
  driftSpread: number
  steps: number
}

export interface LiveErrorResponse {
  type: 'live-error'
  message: string
}

export interface PortraitResponse {
  type: 'portrait'
  requestId: number
  vertexCount: number
  data: Float32Array
  seedCount: number
  segments: number
  eMin: number
  eMax: number
}

export interface PortraitProgressResponse {
  type: 'portrait-progress'
  requestId: number
  progress: number
}

export interface PortraitErrorResponse {
  type: 'portrait-error'
  requestId: number
  message: string
}

export type WorkerResponse =
  | FieldResponse
  | FieldErrorResponse
  | LiveSeededResponse
  | LiveSnapshotResponse
  | LiveErrorResponse
  | PortraitResponse
  | PortraitProgressResponse
  | PortraitErrorResponse
