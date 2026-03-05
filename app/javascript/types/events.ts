export interface ConnectionChangeDetail {
  online: boolean;
}

export interface DrawingCreatedDetail {
  symbol: string;
  timeframe: string;
  id: string;
}

export interface LabelCreatedDetail {
  text: string;
  time: number;
  price: number;
  color: string;
  overlayId: string;
  symbol: string;
  mode: string;
  modeDetail: string;
}

export interface LineCreatedDetail {
  p1: { time: number; price: number };
  p2: { time: number; price: number };
  color: string;
  width: number;
  overlayId: string;
  symbol: string;
  mode: string;
  modeDetail: string;
}

export interface HLineCreatedDetail {
  price: number;
  color: string;
  width: number;
  overlayId: string;
  symbol: string;
  mode: string;
  modeDetail: string;
}

export interface VLineCreatedDetail {
  time: number;
  color: string;
  width: number;
  overlayId: string;
  symbol: string;
  mode: string;
  modeDetail: string;
}
