export type ScreenResolution = '480p' | '720p' | '1080p' | '2k' | 'ultrawide'
export type ScreenFPS = 15 | 30 | 60

interface EncodingParams {
  width: number
  height: number
  maxFramerate: number
  maxBitrate: number
}

const RESOLUTION_MAP: Record<ScreenResolution, { width: number; height: number }> = {
  '480p': { width: 854, height: 480 },
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '2k': { width: 2560, height: 1440 },
  'ultrawide': { width: 3440, height: 1440 },
}

const BITRATE_MAP: Record<ScreenResolution, Record<ScreenFPS, number>> = {
  '480p': { 15: 800_000, 30: 1_500_000, 60: 2_000_000 },
  '720p': { 15: 1_800_000, 30: 3_000_000, 60: 4_500_000 },
  '1080p': { 15: 3_000_000, 30: 6_000_000, 60: 9_000_000 },
  '2k': { 15: 5_000_000, 30: 10_000_000, 60: 14_000_000 },
  'ultrawide': { 15: 6_000_000, 30: 12_000_000, 60: 16_000_000 },
}

export function getScreenShareEncodingParams(
  resolution: ScreenResolution,
  fps: ScreenFPS
): EncodingParams {
  const { width, height } = RESOLUTION_MAP[resolution]
  const maxBitrate = BITRATE_MAP[resolution][fps]

  return {
    width,
    height,
    maxFramerate: fps,
    maxBitrate,
  }
}

export const RESOLUTION_OPTIONS: { value: ScreenResolution; label: string }[] = [
  { value: '480p', label: '480p (854x480)' },
  { value: '720p', label: '720p (1280x720)' },
  { value: '1080p', label: '1080p (1920x1080)' },
  { value: '2k', label: '2K (2560x1440)' },
  { value: 'ultrawide', label: 'Ultrawide (3440x1440)' },
]

export const FPS_OPTIONS: { value: ScreenFPS; label: string }[] = [
  { value: 15, label: '15 FPS' },
  { value: 30, label: '30 FPS' },
  { value: 60, label: '60 FPS' },
]
