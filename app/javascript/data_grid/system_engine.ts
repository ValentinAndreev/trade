/**
 * Re-export facade — all implementations have moved to data_grid/engines/.
 * Keep this file so existing imports (tabs_controller, data_grid_controller, etc.) continue to work.
 */
export { generateTrades, computeFillPrice }   from "./engines/trade_generator"
export { computeSystemStats }                  from "./engines/stats_computer"
export { getSystemSignals, type SystemSignal } from "./engines/signal_builder"
