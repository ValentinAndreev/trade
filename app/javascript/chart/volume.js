import { VOLUME_UP_COLOR, VOLUME_DOWN_COLOR } from "./theme"

export function toVolumePoint(candle) {
  return {
    time: candle.time,
    value: candle.volume || 0,
    color: candle.close >= candle.open ? VOLUME_UP_COLOR : VOLUME_DOWN_COLOR,
  }
}

export function toVolumeData(candles) {
  return candles.map(toVolumePoint)
}
