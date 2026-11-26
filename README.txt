TradingView Mobile Pro Chart (Modular HTML / CSS / JS)
======================================================

Files Included:
- index.html             -> Main app shell & bottom sheets
- styles.css             -> TradingView dark mobile theme & touch layout
- js/config.js           -> Versioned localStorage settings store (tv_pro_chart_v8)
- js/dataEngine.js       -> Live Binance REST (4-endpoint fallback) + WebSocket (@kline & @aggTrade)
- js/indicators.js       -> 9 isolated indicators:
                            1. BTC Flow (Buy/Sell qty, %, split volume)
                            2. Absorption & CVD (with High-Prob RSI Filter + bottom CVD pane)
                            3. RSI (14) + MA sub-pane
                            4. Session VWAP + EMA 20/50
                            5. Support & Resistance Zones
                            6. MACD (12, 26, 9) sub-pane
                            7. Major Market Structure (HH/HL/LH/LL, BOS, live Bias)
                            8. SMC Pro (CHoCH lines, BSL/SSL/EQH/EQL Liquidity, Sweeps, Order Blocks, SM Entries)
                            9. Chart Patterns (W/M, Triangles/Wedges, Head & Shoulders)
- js/renderer.js         -> 60fps High-DPI Canvas renderer with error-isolated draw calls
- js/touchController.js  -> Smooth mobile 1-finger kinetic pan, 2-finger X/Y pinch-to-zoom, axis drag, long-press crosshair
- js/ui.js               -> Collapsed [fx] HUD pill, Clean Chart mode, Master ALL Indicators settings panel
- js/app.js              -> Application entry point

How to Run:
1. Extract the ZIP folder.
2. Open `index.html` directly in Chrome / Safari on mobile or desktop (no build step or server required),
   OR deploy the folder directly to Netlify / GitHub Pages.
