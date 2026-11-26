window.TVChart = window.TVChart || {};

(function (TV) {
  function fmtPrice(val, dec) {
    if (!isFinite(val)) return "--";
    return val.toLocaleString("en-US", {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec
    });
  }

  function fmtCompact(val, dec) {
    if (!isFinite(val)) return "0";
    const abs = Math.abs(val);
    if (abs >= 1e6) return (val / 1e6).toFixed(1) + "M";
    if (abs >= 1e3) return (val / 1e3).toFixed(1) + "K";
    return val.toFixed(dec !== undefined ? dec : 2);
  }

  function fmtTime(ts, tf) {
    const d = new Date(ts);
    const hh = d.getHours();
    const mm = String(d.getMinutes()).padStart(2, "0");
    if (tf === "1h" || tf === "4h") {
      const mon = d.toLocaleString("en-US", { month: "short" });
      return `${mon} ${d.getDate()} ${String(hh).padStart(2, "0")}:${mm}`;
    }
    const ap = hh >= 12 ? "PM" : "AM";
    const h12 = hh % 12 || 12;
    return `${String(h12).padStart(2, "0")}:${mm} ${ap}`;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawPill(ctx, text, cx, cy, bg, fg, border, fontSize) {
    ctx.save();
    ctx.font = `700 ${fontSize || 9.5}px -apple-system, BlinkMacSystemFont, sans-serif`;
    const tw = ctx.measureText(text).width;
    const padX = 5;
    const h = (fontSize || 9.5) + 6;
    const w = tw + padX * 2;
    const x = cx - w / 2;
    const y = cy - h / 2;
    roundRect(ctx, x, y, w, h, 4);
    ctx.fillStyle = bg;
    ctx.fill();
    if (border) {
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.fillStyle = fg;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, cx, cy + 0.5);
    ctx.restore();
  }

  class CanvasRenderer {
    constructor(canvas, state) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.state = state;
      this.width = 360;
      this.height = 560;
      this.dpr = Math.min(window.devicePixelRatio || 1, 3);
      this.axisRightW = 64;
      this.axisBottomH = 26;
      this.layout = { main: null, panes: [] };

      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(canvas.parentElement);
      this.resize();
    }

    resize() {
      const parent = this.canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return;
      this.width = Math.floor(rect.width);
      this.height = Math.floor(rect.height);
      this.dpr = Math.min(window.devicePixelRatio || 1, 3);
      this.canvas.width = Math.floor(this.width * this.dpr);
      this.canvas.height = Math.floor(this.height * this.dpr);
      this.canvas.style.width = this.width + "px";
      this.canvas.style.height = this.height + "px";
      this.state.needsRender = true;
    }

    computeLayout(cfg) {
      const totalH = Math.max(120, this.height - this.axisBottomH);
      const activePanes = [];
      if (cfg.absCvd.enabled && cfg.absCvd.showSubPane) activePanes.push("cvd");
      if (cfg.rsi.enabled) activePanes.push("rsi");
      if (cfg.macd.enabled) activePanes.push("macd");

      const maxSubTotal = Math.floor(totalH * 0.46); // Main chart guaranteed >= 54%
      let eachSubH = 0;
      if (activePanes.length === 1) eachSubH = Math.min(108, maxSubTotal);
      else if (activePanes.length === 2) eachSubH = Math.min(86, Math.floor(maxSubTotal / 2));
      else if (activePanes.length === 3) eachSubH = Math.floor(maxSubTotal / 3);

      const mainH = totalH - eachSubH * activePanes.length;
      const plotW = Math.max(80, this.width - this.axisRightW);

      const panes = [];
      let curY = mainH;
      activePanes.forEach((id) => {
        panes.push({ id, top: curY, height: eachSubH, bottom: curY + eachSubH });
        curY += eachSubH;
      });

      this.layout = {
        plotW,
        totalH,
        main: { top: 0, height: mainH, bottom: mainH },
        panes
      };
      return this.layout;
    }

    idxToX(idx) {
      const v = this.state.view;
      const plotW = this.layout.plotW;
      const rightIndex = this.state.candles.length - 1 + v.rightOffset;
      return plotW - (rightIndex - idx) * v.spacing - v.spacing * 0.5;
    }

    xToIdx(x) {
      const v = this.state.view;
      const plotW = this.layout.plotW;
      const rightIndex = this.state.candles.length - 1 + v.rightOffset;
      return Math.round(rightIndex - (plotW - x - v.spacing * 0.5) / v.spacing);
    }

    priceToY(price) {
      const { top, height } = this.layout.main;
      const padTop = 34;
      const padBot = Math.max(24, height * 0.16);
      const usableH = Math.max(20, height - padTop - padBot);
      const { minPrice, maxPrice } = this.state.view;
      const span = Math.max(1e-9, maxPrice - minPrice);
      return top + padTop + ((maxPrice - price) / span) * usableH;
    }

    yToPrice(y) {
      const { top, height } = this.layout.main;
      const padTop = 34;
      const padBot = Math.max(24, height * 0.16);
      const usableH = Math.max(20, height - padTop - padBot);
      const { minPrice, maxPrice } = this.state.view;
      return maxPrice - ((y - (top + padTop)) / usableH) * (maxPrice - minPrice);
    }

    render() {
      const ctx = this.ctx;
      const cfg = TV.ConfigStore.data;
      const candles = this.state.candles;
      const ind = this.state.indicators;
      const symMeta = TV.ConfigStore.getSymbolMeta(cfg.symbol);

      ctx.save();
      ctx.scale(this.dpr, this.dpr);

      // Clear background
      ctx.fillStyle = "#131722";
      ctx.fillRect(0, 0, this.width, this.height);

      this.computeLayout(cfg);
      const { plotW, main, panes } = this.layout;

      if (!candles.length) {
        ctx.restore();
        return;
      }

      // Visible index bounds
      const startIdx = Math.max(0, this.xToIdx(0) - 2);
      const endIdx = Math.min(candles.length - 1, this.xToIdx(plotW) + 2);

      // Auto-Fit Y-Axis
      if (this.state.view.autoFit) {
        let minP = Infinity, maxP = -Infinity;
        for (let i = startIdx; i <= endIdx; i++) {
          if (candles[i].low < minP) minP = candles[i].low;
          if (candles[i].high > maxP) maxP = candles[i].high;
        }
        if (isFinite(minP) && isFinite(maxP)) {
          if (maxP === minP) { maxP += 1; minP -= 1; }
          const pad = (maxP - minP) * 0.08;
          this.state.view.minPrice = minP - pad;
          this.state.view.maxPrice = maxP + pad;
        }
      }

      // 1. Main Grid + Price Axis
      this.drawGridAndAxes(ctx, startIdx, endIdx, symMeta.decimals, cfg.timeframe);

      // Clip Main Plot Area
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, main.top, plotW, main.height);
      ctx.clip();

      // 2. Background Zones (S/R Levels, SMC Liquidity & Order Blocks)
      this.safeDraw(() => { if (cfg.srLevels.enabled) this.drawSR(ctx, ind.sr, cfg.srLevels, plotW); });
      this.safeDraw(() => { if (cfg.smcPro.enabled) this.drawSmcZones(ctx, ind.smcPro, cfg.smcPro, plotW); });

      // 3. Integrated Volume Bars (Bottom 20% of Main Pane)
      this.safeDraw(() => this.drawVolume(ctx, candles, ind.flow, startIdx, endIdx, cfg.btcFlow));

      // 4. VWAP & EMAs
      this.safeDraw(() => { if (cfg.vwapEma.enabled) this.drawVwapEma(ctx, ind.vwapEma, startIdx, endIdx, cfg.vwapEma); });

      // 5. Chart Patterns (Polylines / Triangles / Necklines)
      this.safeDraw(() => { if (cfg.patterns.enabled) this.drawPatterns(ctx, ind.patterns, cfg.patterns, plotW); });

      // 6. Candlesticks + Absorption Halos
      this.safeDraw(() => this.drawCandles(ctx, candles, ind.absCvd, startIdx, endIdx, cfg.absCvd));

      // 7. Market Structure (Swings HH/HL/LH/LL & BOS)
      this.safeDraw(() => { if (cfg.structure.enabled) this.drawStructure(ctx, ind.structure, cfg.structure, startIdx, endIdx); });

      // 8. SMC Pro Foreground (CHoCH Lines, Sweeps, Smart Money Entries)
      this.safeDraw(() => { if (cfg.smcPro.enabled) this.drawSmcSignals(ctx, ind.smcPro, cfg.smcPro, startIdx, endIdx); });

      // 9. BTC Flow Labels & Absorption Badges
      this.safeDraw(() => { if (cfg.btcFlow.enabled && cfg.btcFlow.showLabels) this.drawFlowLabels(ctx, candles, ind.flow, startIdx, endIdx, cfg.btcFlow); });
      this.safeDraw(() => { if (cfg.absCvd.enabled && cfg.absCvd.showMarkers) this.drawAbsMarkers(ctx, ind.absCvd, startIdx, endIdx, cfg.absCvd, cfg.btcFlow.enabled && cfg.btcFlow.showLabels); });

      // 10. High/Low Reference Lines & Live Price Line
      this.safeDraw(() => this.drawPriceLines(ctx, candles, startIdx, endIdx, cfg, symMeta.decimals));

      ctx.restore(); // End Main Clip

      // Live Price + Countdown Badge on Right Y-Axis
      this.safeDraw(() => this.drawLivePriceBadge(ctx, candles, symMeta.decimals, cfg.timeframe));

      // 11. Stacked Bottom Sub-Panes (CVD, RSI, MACD)
      panes.forEach((pane) => {
        ctx.strokeStyle = "#2a2e39";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, pane.top + 0.5);
        ctx.lineTo(this.width, pane.top + 0.5);
        ctx.stroke();

        if (pane.id === "cvd") this.safeDraw(() => this.drawCvdPane(ctx, pane, ind.absCvd, startIdx, endIdx, cfg.absCvd));
        else if (pane.id === "rsi") this.safeDraw(() => this.drawRsiPane(ctx, pane, ind.rsi, startIdx, endIdx, cfg.rsi));
        else if (pane.id === "macd") this.safeDraw(() => this.drawMacdPane(ctx, pane, ind.macd, startIdx, endIdx, cfg.macd));
      });

      // 12. Crosshair Across All Panes
      if (this.state.crosshair.active) {
        this.safeDraw(() => this.drawCrosshair(ctx, candles, symMeta.decimals, cfg.timeframe));
      }

      ctx.restore();
    }

    safeDraw(fn) {
      try { fn(); } catch (e) {}
    }

    drawGridAndAxes(ctx, startIdx, endIdx, dec, tf) {
      const { plotW, main, totalH } = this.layout;
      const { minPrice, maxPrice } = this.state.view;

      // Vertical Separator for Right Axis & Bottom Axis
      ctx.strokeStyle = "#242836";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(plotW + 0.5, 0);
      ctx.lineTo(plotW + 0.5, totalH);
      ctx.moveTo(0, totalH + 0.5);
      ctx.lineTo(this.width, totalH + 0.5);
      ctx.stroke();

      // Horizontal Price Grid
      const span = Math.max(1e-9, maxPrice - minPrice);
      const approxTicks = Math.max(4, Math.floor(main.height / 54));
      const rawStep = span / approxTicks;
      const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
      const norm = rawStep / mag;
      const niceStep = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
      const firstTick = Math.ceil(minPrice / niceStep) * niceStep;

      ctx.font = "500 10.5px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";

      for (let p = firstTick; p <= maxPrice; p += niceStep) {
        const y = Math.round(this.priceToY(p)) + 0.5;
        if (y < main.top + 14 || y > main.bottom - 12) continue;
        ctx.strokeStyle = "rgba(42, 46, 57, 0.55)";
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(plotW, y);
        ctx.stroke();

        ctx.fillStyle = "#8a8f9e";
        ctx.fillText(fmtPrice(p, dec), plotW + 6, y);
      }

      // Vertical Time Grid + Bottom X-Axis Labels
      const spacing = this.state.view.spacing;
      const stepCandles = Math.max(1, Math.ceil(92 / spacing));
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      for (let i = Math.ceil(startIdx / stepCandles) * stepCandles; i <= endIdx; i += stepCandles) {
        const c = this.state.candles[i];
        if (!c) continue;
        const x = Math.round(this.idxToX(i)) + 0.5;
        if (x < 24 || x > plotW - 24) continue;
        ctx.strokeStyle = "rgba(42, 46, 57, 0.48)";
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, totalH);
        ctx.stroke();

        ctx.fillStyle = "#8a8f9e";
        ctx.fillText(fmtTime(c.time, tf), x, totalH + this.axisBottomH / 2);
      }
    }

    drawVolume(ctx, candles, flow, startIdx, endIdx, flowCfg) {
      const { main } = this.layout;
      const volH = main.height * 0.2;
      let maxV = 0;
      for (let i = startIdx; i <= endIdx; i++) {
        if (candles[i].volume > maxV) maxV = candles[i].volume;
      }
      if (maxV <= 0) return;

      const bw = Math.max(1.5, this.state.view.spacing * 0.68);
      for (let i = startIdx; i <= endIdx; i++) {
        const c = candles[i];
        const x = this.idxToX(i) - bw / 2;
        const totalH = (c.volume / maxV) * volH;
        const yBot = main.bottom;

        if (flowCfg.enabled && flowCfg.showSplitVol && flow[i]) {
          const buyH = totalH * (flow[i].buyPct / 100);
          const sellH = totalH - buyH;
          ctx.fillStyle = flowCfg.buyColor + "55";
          ctx.fillRect(x, yBot - buyH, bw, buyH);
          ctx.fillStyle = flowCfg.sellColor + "55";
          ctx.fillRect(x, yBot - buyH - sellH, bw, sellH);
        } else {
          ctx.fillStyle = c.close >= c.open ? "rgba(8, 153, 129, 0.34)" : "rgba(242, 54, 69, 0.34)";
          ctx.fillRect(x, yBot - totalH, bw, totalH);
        }
      }
    }

    drawCandles(ctx, candles, absCvd, startIdx, endIdx, absCfg) {
      const bw = Math.max(1.5, Math.min(26, this.state.view.spacing * 0.68));
      const absMap = new Map();
      if (absCfg.enabled && absCfg.showHalo && absCvd.signals) {
        absCvd.signals.forEach((s) => absMap.set(s.idx, s.dir));
      }

      for (let i = startIdx; i <= endIdx; i++) {
        const c = candles[i];
        const x = this.idxToX(i);
        const yO = this.priceToY(c.open);
        const yC = this.priceToY(c.close);
        const yH = this.priceToY(c.high);
        const yL = this.priceToY(c.low);
        const up = c.close >= c.open;
        const col = up ? "#089981" : "#f23645";

        // Optional Absorption Halo
        const absDir = absMap.get(i);
        if (absDir) {
          ctx.save();
          ctx.fillStyle = absDir === "bull" ? "rgba(0, 230, 118, 0.16)" : "rgba(255, 23, 68, 0.16)";
          ctx.fillRect(x - bw * 0.72, yH - 3, bw * 1.44, Math.max(8, yL - yH + 6));
          ctx.restore();
        }

        // Wick
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(1, Math.min(2, bw * 0.16));
        ctx.beginPath();
        ctx.moveTo(x, yH);
        ctx.lineTo(x, yL);
        ctx.stroke();

        // Body
        const bodyTop = Math.min(yO, yC);
        const bodyH = Math.max(1.4, Math.abs(yC - yO));
        ctx.fillStyle = col;
        ctx.fillRect(x - bw / 2, bodyTop, bw, bodyH);
      }
    }

    drawVwapEma(ctx, vwapEma, startIdx, endIdx, cfg) {
      const drawLine = (arr, color, width, dash) => {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        if (dash) ctx.setLineDash(dash);
        ctx.beginPath();
        let started = false;
        for (let i = startIdx; i <= endIdx; i++) {
          const val = arr[i];
          if (val === null || !isFinite(val)) { started = false; continue; }
          const x = this.idxToX(i);
          const y = this.priceToY(val);
          if (!started) { ctx.moveTo(x, y); started = true; }
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
      };

      if (cfg.showVwap) {
        drawLine(vwapEma.vwap, cfg.vwapColor, 1.6);
        if (cfg.showBands) {
          drawLine(vwapEma.upper, cfg.vwapColor + "88", 1, [4, 4]);
          drawLine(vwapEma.lower, cfg.vwapColor + "88", 1, [4, 4]);
        }
      }
      if (cfg.showEmaFast) drawLine(vwapEma.emaFast, cfg.fastColor, 1.3);
      if (cfg.showEmaSlow) drawLine(vwapEma.emaSlow, cfg.slowColor, 1.3);
    }

    drawSR(ctx, sr, cfg, plotW) {
      if (!sr || !sr.zones) return;
      sr.zones.forEach((z) => {
        const yTop = this.priceToY(z.max);
        const yBot = this.priceToY(z.min);
        const yMid = this.priceToY(z.mid);
        const col = z.type === "R" ? cfg.resColor : cfg.supColor;
        ctx.fillStyle = col + "1c";
        ctx.fillRect(0, yTop, plotW, Math.max(4, yBot - yTop));

        ctx.strokeStyle = col + "88";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, yMid);
        ctx.lineTo(plotW, yMid);
        ctx.stroke();
        ctx.setLineDash([]);

        if (cfg.showLabels) {
          ctx.font = "600 9.5px -apple-system, sans-serif";
          ctx.fillStyle = col;
          ctx.textAlign = "right";
          ctx.textBaseline = "bottom";
          ctx.fillText(`${z.type} · ${z.touches}x`, plotW - 6, yTop - 2);
        }
      });
    }

    drawStructure(ctx, structure, cfg, startIdx, endIdx) {
      if (cfg.showSwings) {
        ctx.font = "700 9px -apple-system, sans-serif";
        ctx.textAlign = "center";
        structure.swings.forEach((s) => {
          if (s.idx < startIdx || s.idx > endIdx) return;
          const x = this.idxToX(s.idx);
          const y = this.priceToY(s.price);
          const isH = s.type === "H";
          ctx.fillStyle = isH ? cfg.bearColor : cfg.bullColor;
          ctx.textBaseline = isH ? "bottom" : "top";
          ctx.fillText(s.tag, x, isH ? y - 4 : y + 4);
        });
      }

      if (cfg.showBos) {
        structure.breaks.forEach((b) => {
          if (b.toIdx < startIdx || b.fromIdx > endIdx) return;
          if (b.kind === "CHoCH") return; // Handled prominently by SMC Pro if enabled
          const x1 = this.idxToX(b.fromIdx);
          const x2 = this.idxToX(b.toIdx);
          const y = this.priceToY(b.price);
          const col = b.dir === "bull" ? cfg.bullColor : cfg.bearColor;
          ctx.save();
          ctx.strokeStyle = col;
          ctx.lineWidth = 1.1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(x1, y);
          ctx.lineTo(x2, y);
          ctx.stroke();
          ctx.restore();
          drawPill(ctx, b.dir === "bull" ? "BOS ↑" : "BOS ↓", (x1 + x2) / 2, y, col + "33", col, col, 8.5);
        });
      }
    }

    drawSmcZones(ctx, smc, cfg, plotW) {
      // Liquidity Zones ($$$ BSL / SSL / EQH / EQL)
      if (cfg.showLiq && smc.liqZones) {
        smc.liqZones.forEach((lz) => {
          const x1 = Math.max(0, this.idxToX(lz.startIdx));
          const x2 = lz.swept ? this.idxToX(lz.endIdx) : plotW;
          if (x2 < 0 || x1 > plotW) return;
          const y = this.priceToY(lz.price);
          const col = lz.side === "BSL" ? "#ffab00" : "#00e5ff";

          ctx.save();
          ctx.fillStyle = col + "16";
          ctx.fillRect(x1, y - 4, Math.max(8, x2 - x1), 8);
          ctx.strokeStyle = col;
          ctx.lineWidth = 1.1;
          ctx.setLineDash([2, 3]);
          ctx.beginPath();
          ctx.moveTo(x1, y);
          ctx.lineTo(x2, y);
          ctx.stroke();
          ctx.restore();

          ctx.font = "700 9px -apple-system, sans-serif";
          ctx.fillStyle = col;
          ctx.textAlign = "right";
          ctx.textBaseline = "bottom";
          ctx.fillText(lz.label, Math.min(plotW - 4, x2 - 2), y - 4);
        });
      }

      // Order Blocks (Bull OB / Bear OB)
      if (cfg.showOb && smc.orderBlocks) {
        smc.orderBlocks.forEach((ob) => {
          const x1 = Math.max(0, this.idxToX(ob.idx));
          const x2 = ob.mitigatedIdx !== null ? this.idxToX(ob.mitigatedIdx) : plotW;
          if (x2 < 0 || x1 > plotW) return;
          const yTop = this.priceToY(ob.top);
          const yBot = this.priceToY(ob.bottom);
          const col = ob.dir === "bull" ? "#00e676" : "#ff1744";

          ctx.fillStyle = col + "1e";
          ctx.fillRect(x1, yTop, Math.max(10, x2 - x1), Math.max(5, yBot - yTop));
          ctx.strokeStyle = col + "77";
          ctx.lineWidth = 1;
          ctx.strokeRect(x1, yTop, Math.max(10, x2 - x1), Math.max(5, yBot - yTop));

          ctx.font = "700 8.5px -apple-system, sans-serif";
          ctx.fillStyle = col;
          ctx.textAlign = "left";
          ctx.textBaseline = "top";
          ctx.fillText(ob.dir === "bull" ? "Bull OB" : "Bear OB", x1 + 4, yTop + 2);
        });
      }
    }

    drawSmcSignals(ctx, smc, cfg, startIdx, endIdx) {
      // High-visibility CHoCH Lines
      if (cfg.showChoch && smc.chochs) {
        smc.chochs.forEach((ch) => {
          if (ch.toIdx < startIdx || ch.fromIdx > endIdx) return;
          const x1 = this.idxToX(ch.fromIdx);
          const x2 = this.idxToX(ch.toIdx);
          const y = this.priceToY(ch.price);
          const col = ch.dir === "bull" ? "#00e676" : "#ff1744";
          ctx.save();
          ctx.strokeStyle = col;
          ctx.lineWidth = 1.6;
          ctx.setLineDash([5, 3]);
          ctx.beginPath();
          ctx.moveTo(x1, y);
          ctx.lineTo(x2, y);
          ctx.stroke();
          ctx.restore();
          drawPill(ctx, ch.dir === "bull" ? "CHoCH ↑" : "CHoCH ↓", (x1 + x2) / 2, y, col, "#0b0e14", null, 9);
        });
      }

      // Liquidity Sweeps
      if (cfg.showSweeps && smc.sweeps) {
        smc.sweeps.forEach((sw) => {
          if (sw.idx < startIdx || sw.idx > endIdx) return;
          const x = this.idxToX(sw.idx);
          const y = this.priceToY(sw.price);
          const isBull = sw.dir === "bull";
          const col = isBull ? "#00e5ff" : "#ffab00";
          drawPill(ctx, isBull ? "SWEEP ↑" : "SWEEP ↓", x, isBull ? y + 16 : y - 16, "#161b26", col, col, 8.5);
        });
      }

      // Smart Money Entries
      if (cfg.showEntries && smc.entries) {
        smc.entries.forEach((en) => {
          if (en.idx < startIdx || en.idx > endIdx) return;
          const x = this.idxToX(en.idx);
          const y = this.priceToY(en.price);
          const isBull = en.dir === "bull";
          const col = isBull ? "#00e676" : "#ff1744";
          const py = isBull ? y + 32 : y - 32;
          drawPill(ctx, isBull ? "SM LONG ↑" : "SM SHORT ↓", x, py, col, "#0b0e14", "#ffffff44", 9);
        });
      }
    }

    drawPatterns(ctx, patterns, cfg, plotW) {
      if (!patterns || !patterns.length) return;
      patterns.forEach((pat) => {
        const col = pat.dir === "bull" ? "#26c6da" : pat.dir === "bear" ? "#ff7043" : "#b388ff";

        if (pat.kind === "TRI" && pat.highs && pat.lows) {
          const h1 = pat.highs[0], h2 = pat.highs[1];
          const l1 = pat.lows[0], l2 = pat.lows[1];
          const xh1 = this.idxToX(h1.idx), yh1 = this.priceToY(h1.price);
          const xh2 = this.idxToX(h2.idx), yh2 = this.priceToY(h2.price);
          const xl1 = this.idxToX(l1.idx), yl1 = this.priceToY(l1.price);
          const xl2 = this.idxToX(l2.idx), yl2 = this.priceToY(l2.price);

          ctx.save();
          ctx.fillStyle = col + "18";
          ctx.beginPath();
          ctx.moveTo(xh1, yh1);
          ctx.lineTo(xh2, yh2);
          ctx.lineTo(xl2, yl2);
          ctx.lineTo(xl1, yl1);
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = col;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(xh1, yh1); ctx.lineTo(xh2, yh2);
          ctx.moveTo(xl1, yl1); ctx.lineTo(xl2, yl2);
          ctx.stroke();
          ctx.restore();

          drawPill(ctx, pat.name, (xh2 + xl2) / 2, Math.min(yh2, yl2) - 14, "#1a1f2e", col, col, 9);
          return;
        }

        if (!pat.points || pat.points.length < 3) return;
        ctx.save();
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.6;
        if (!pat.confirmed) ctx.setLineDash([5, 3]);
        ctx.beginPath();
        pat.points.forEach((pt, idx) => {
          const x = this.idxToX(pt.idx);
          const y = this.priceToY(pt.price);
          if (idx === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.restore();

        // H&S tags
        if (pat.tags) {
          ctx.font = "700 8.5px -apple-system, sans-serif";
          ctx.fillStyle = col;
          ctx.textAlign = "center";
          pat.points.forEach((pt, idx) => {
            if (!pat.tags[idx]) return;
            const x = this.idxToX(pt.idx);
            const y = this.priceToY(pt.price);
            ctx.fillText(pat.tags[idx], x, pt.type === "H" ? y - 12 : y + 14);
          });
        }

        // Neckline + Target
        const firstX = this.idxToX(pat.points[0].idx);
        const lastX = Math.min(plotW - 10, this.idxToX(pat.points[pat.points.length - 1].idx) + 40);
        const neckY = this.priceToY(pat.neckline);
        ctx.save();
        ctx.strokeStyle = col + "aa";
        ctx.lineWidth = 1.1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(firstX, neckY);
        ctx.lineTo(lastX, neckY);
        ctx.stroke();
        ctx.restore();

        const midPt = pat.points[Math.floor(pat.points.length / 2)];
        drawPill(ctx, pat.name, this.idxToX(midPt.idx), this.priceToY(midPt.price) + (pat.dir === "bull" ? -16 : 16), "#1a1f2e", col, col, 9);

        if (cfg.showTargets && isFinite(pat.target)) {
          const ty = this.priceToY(pat.target);
          if (ty > 10 && ty < this.layout.main.bottom - 10) {
            ctx.save();
            ctx.strokeStyle = col + "77";
            ctx.setLineDash([2, 4]);
            ctx.beginPath();
            ctx.moveTo(lastX - 30, ty);
            ctx.lineTo(lastX + 20, ty);
            ctx.stroke();
            ctx.restore();
            ctx.font = "700 8.5px -apple-system, sans-serif";
            ctx.fillStyle = col;
            ctx.textAlign = "left";
            ctx.fillText("TP", lastX - 28, ty - 3);
          }
        }
      });
    }

    drawFlowLabels(ctx, candles, flow, startIdx, endIdx, cfg) {
      const spacing = this.state.view.spacing;
      if (spacing < 14) return; // Keep zoomed-out view clean
      const minGap = 46;
      let lastXTop = -999, lastXBot = -999;

      ctx.font = `600 ${cfg.fontSize || 9}px -apple-system, sans-serif`;
      ctx.textAlign = "center";

      for (let i = startIdx; i <= endIdx; i++) {
        const f = flow[i];
        if (!f || f.total < (cfg.minVol || 0)) continue;
        const x = this.idxToX(i);
        const c = candles[i];
        const dec = cfg.decimals !== undefined ? cfg.decimals : 2;
        const isLast = i === candles.length - 1;

        // Upside Buy label
        if ((f.buyPct >= (cfg.minDomPct || 50) || isLast) && (x - lastXTop >= minGap || isLast)) {
          const yTop = this.priceToY(c.high) - 10;
          ctx.fillStyle = cfg.buyColor;
          ctx.textBaseline = "bottom";
          ctx.fillText(`B ${fmtCompact(f.buy, dec)} (${Math.round(f.buyPct)}%)`, x, yTop);
          lastXTop = x;
        }
        // Downside Sell label
        if ((f.sellPct >= (cfg.minDomPct || 50) || isLast) && (x - lastXBot >= minGap || isLast)) {
          const yBot = this.priceToY(c.low) + 10;
          ctx.fillStyle = cfg.sellColor;
          ctx.textBaseline = "top";
          ctx.fillText(`S ${fmtCompact(f.sell, dec)} (${Math.round(f.sellPct)}%)`, x, yBot);
          lastXBot = x;
        }
      }
    }

    drawAbsMarkers(ctx, absCvd, startIdx, endIdx, cfg, hasFlowLabels) {
      if (!absCvd || !absCvd.signals) return;
      const offset = hasFlowLabels ? 24 : 14;
      absCvd.signals.forEach((s) => {
        if (s.idx < startIdx || s.idx > endIdx) return;
        const x = this.idxToX(s.idx);
        const y = this.priceToY(s.price);
        if (s.dir === "bull") {
          drawPill(ctx, "ABS ↑", x, y + offset, "#102820", cfg.bullColor, cfg.bullColor, 8.5);
        } else {
          drawPill(ctx, "ABS ↓", x, y - offset, "#2c1419", cfg.bearColor, cfg.bearColor, 8.5);
        }
      });
    }

    drawPriceLines(ctx, candles, startIdx, endIdx, cfg, dec) {
      const { plotW } = this.layout;
      const last = candles[candles.length - 1];
      const yLast = this.priceToY(last.close);
      const up = last.close >= last.open;
      const col = up ? "#089981" : "#f23645";

      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(0, yLast);
      ctx.lineTo(plotW, yLast);
      ctx.stroke();

      if (cfg.showHiLoLines) {
        let hi = -Infinity, lo = Infinity;
        for (let i = startIdx; i <= endIdx; i++) {
          if (candles[i].high > hi) hi = candles[i].high;
          if (candles[i].low < lo) lo = candles[i].low;
        }
        if (isFinite(hi) && isFinite(lo)) {
          ctx.strokeStyle = "rgba(242, 54, 69, 0.45)";
          ctx.setLineDash([4, 5]);
          const yH = this.priceToY(hi);
          const yL = this.priceToY(lo);
          ctx.beginPath();
          ctx.moveTo(0, yH); ctx.lineTo(plotW, yH);
          ctx.moveTo(0, yL); ctx.lineTo(plotW, yL);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    drawLivePriceBadge(ctx, candles, dec, tf) {
      const { plotW, main } = this.layout;
      const last = candles[candles.length - 1];
      const y = Math.max(main.top + 16, Math.min(main.bottom - 16, this.priceToY(last.close)));
      const up = last.close >= last.open;
      const bg = up ? "#089981" : "#f23645";

      // Countdown timer
      const remSec = Math.max(0, Math.floor((last.closeTime - Date.now()) / 1000));
      const mm = String(Math.floor(remSec / 60)).padStart(2, "0");
      const ss = String(remSec % 60).padStart(2, "0");

      const bx = plotW + 1;
      const bw = this.axisRightW - 2;
      const bh = 28;
      roundRect(ctx, bx, y - bh / 2, bw, bh, 3);
      ctx.fillStyle = bg;
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = "700 10.5px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(fmtPrice(last.close, dec), bx + bw / 2, y - 5.5);
      ctx.font = "600 9.5px -apple-system, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.88)";
      ctx.fillText(`${mm}:${ss}`, bx + bw / 2, y + 6.5);
    }

    drawCvdPane(ctx, pane, absCvd, startIdx, endIdx, cfg) {
      const { plotW } = this.layout;
      const { cvd, delta, signals } = absCvd;
      let minC = Infinity, maxC = -Infinity, maxD = 1e-6;
      for (let i = startIdx; i <= endIdx; i++) {
        if (cvd[i] < minC) minC = cvd[i];
        if (cvd[i] > maxC) maxC = cvd[i];
        if (Math.abs(delta[i]) > maxD) maxD = Math.abs(delta[i]);
      }
      if (!isFinite(minC)) return;
      if (maxC === minC) { maxC += 1; minC -= 1; }
      const pad = (maxC - minC) * 0.14;
      minC -= pad; maxC += pad;

      const mapY = (v) => pane.top + 14 + ((maxC - v) / (maxC - minC)) * (pane.height - 20);

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, pane.top, plotW, pane.height);
      ctx.clip();

      // Delta Histogram
      const midY = pane.top + pane.height * 0.55;
      const maxBarH = pane.height * 0.36;
      const bw = Math.max(1.5, this.state.view.spacing * 0.62);
      for (let i = startIdx; i <= endIdx; i++) {
        const d = delta[i] || 0;
        const h = (Math.abs(d) / maxD) * maxBarH;
        const x = this.idxToX(i) - bw / 2;
        ctx.fillStyle = d >= 0 ? "rgba(8, 153, 129, 0.35)" : "rgba(242, 54, 69, 0.35)";
        ctx.fillRect(x, d >= 0 ? midY - h : midY, bw, h);
      }

      // CVD Area + Line
      ctx.beginPath();
      for (let i = startIdx; i <= endIdx; i++) {
        const x = this.idxToX(i);
        const y = mapY(cvd[i]);
        if (i === startIdx) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = cfg.cvdColor;
      ctx.lineWidth = 1.6;
      ctx.stroke();

      // Absorption Dots on CVD
      signals.forEach((s) => {
        if (s.idx < startIdx || s.idx > endIdx) return;
        const x = this.idxToX(s.idx);
        const y = mapY(cvd[s.idx]);
        ctx.beginPath();
        ctx.arc(x, y, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = s.dir === "bull" ? cfg.bullColor : cfg.bearColor;
        ctx.fill();
      });

      ctx.font = "600 9.5px -apple-system, sans-serif";
      ctx.fillStyle = "#8a8f9e";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("CVD · Delta", 8, pane.top + 4);
      ctx.restore();

      // Right Axis Live Badge
      const lastCvd = cvd[cvd.length - 1] || 0;
      const by = Math.max(pane.top + 10, Math.min(pane.bottom - 10, mapY(lastCvd)));
      roundRect(ctx, plotW + 2, by - 9, this.axisRightW - 4, 18, 3);
      ctx.fillStyle = cfg.cvdColor;
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "700 9.5px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText((lastCvd >= 0 ? "+" : "") + fmtCompact(lastCvd, 1), plotW + this.axisRightW / 2, by);
    }

    drawRsiPane(ctx, pane, rsi, startIdx, endIdx, cfg) {
      const { plotW } = this.layout;
      const mapY = (v) => pane.top + 8 + ((100 - v) / 100) * (pane.height - 16);

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, pane.top, plotW, pane.height);
      ctx.clip();

      const yOb = mapY(cfg.ob || 70);
      const y50 = mapY(50);
      const yOs = mapY(cfg.os || 30);

      // Shaded 30-70 band
      ctx.fillStyle = "rgba(171, 71, 188, 0.08)";
      ctx.fillRect(0, yOb, plotW, yOs - yOb);

      ctx.strokeStyle = "rgba(120, 123, 134, 0.35)";
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(0, yOb); ctx.lineTo(plotW, yOb);
      ctx.moveTo(0, y50); ctx.lineTo(plotW, y50);
      ctx.moveTo(0, yOs); ctx.lineTo(plotW, yOs);
      ctx.stroke();
      ctx.setLineDash([]);

      // RSI MA
      if (cfg.showMa) {
        ctx.beginPath();
        let st = false;
        for (let i = startIdx; i <= endIdx; i++) {
          const v = rsi.ma[i];
          if (v === null) { st = false; continue; }
          const x = this.idxToX(i), y = mapY(v);
          if (!st) { ctx.moveTo(x, y); st = true; } else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = cfg.maColor;
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }

      // RSI Line
      ctx.beginPath();
      let st = false;
      for (let i = startIdx; i <= endIdx; i++) {
        const v = rsi.line[i];
        if (v === null) { st = false; continue; }
        const x = this.idxToX(i), y = mapY(v);
        if (!st) { ctx.moveTo(x, y); st = true; } else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = cfg.lineColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.font = "600 9.5px -apple-system, sans-serif";
      ctx.fillStyle = "#8a8f9e";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(`RSI (${cfg.period})`, 8, pane.top + 4);
      ctx.restore();

      // Right Axis Labels + Live Badge
      ctx.font = "500 9.5px -apple-system, sans-serif";
      ctx.fillStyle = "#787b86";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(String(cfg.ob), plotW + 6, yOb);
      ctx.fillText(String(cfg.os), plotW + 6, yOs);

      const lastRsi = rsi.line[rsi.line.length - 1];
      if (lastRsi !== null && isFinite(lastRsi)) {
        const by = Math.max(pane.top + 10, Math.min(pane.bottom - 10, mapY(lastRsi)));
        const bg = lastRsi >= cfg.ob ? "#f23645" : lastRsi <= cfg.os ? "#089981" : cfg.lineColor;
        roundRect(ctx, plotW + 2, by - 9, this.axisRightW - 4, 18, 3);
        ctx.fillStyle = bg;
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "700 9.5px -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(lastRsi.toFixed(1), plotW + this.axisRightW / 2, by);
      }
    }

    drawMacdPane(ctx, pane, macdObj, startIdx, endIdx, cfg) {
      const { plotW } = this.layout;
      let maxAbs = 1e-6;
      for (let i = startIdx; i <= endIdx; i++) {
        if (macdObj.macd[i] !== null) maxAbs = Math.max(maxAbs, Math.abs(macdObj.macd[i]));
        if (macdObj.signal[i] !== null) maxAbs = Math.max(maxAbs, Math.abs(macdObj.signal[i]));
        if (macdObj.hist[i] !== null) maxAbs = Math.max(maxAbs, Math.abs(macdObj.hist[i]));
      }
      maxAbs *= 1.15;
      const mapY = (v) => pane.top + pane.height / 2 - (v / maxAbs) * (pane.height * 0.42);
      const y0 = mapY(0);

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, pane.top, plotW, pane.height);
      ctx.clip();

      // Zero line
      ctx.strokeStyle = "rgba(120, 123, 134, 0.35)";
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(0, y0); ctx.lineTo(plotW, y0);
      ctx.stroke();
      ctx.setLineDash([]);

      // 4-Color Histogram
      const bw = Math.max(1.5, this.state.view.spacing * 0.62);
      for (let i = startIdx; i <= endIdx; i++) {
        const h = macdObj.hist[i];
        if (h === null) continue;
        const prev = i > 0 ? (macdObj.hist[i - 1] || 0) : 0;
        let col = "#26a69a";
        if (h >= 0) col = h >= prev ? "#26a69a" : "#b2dfdb88";
        else col = h <= prev ? "#ef5350" : "#ffcdd288";
        const y = mapY(h);
        ctx.fillStyle = col;
        ctx.fillRect(this.idxToX(i) - bw / 2, Math.min(y0, y), bw, Math.max(1, Math.abs(y - y0)));
      }

      const drawCurve = (arr, color) => {
        ctx.beginPath();
        let st = false;
        for (let i = startIdx; i <= endIdx; i++) {
          if (arr[i] === null) { st = false; continue; }
          const x = this.idxToX(i), y = mapY(arr[i]);
          if (!st) { ctx.moveTo(x, y); st = true; } else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.3;
        ctx.stroke();
      };
      drawCurve(macdObj.macd, cfg.macdColor);
      drawCurve(macdObj.signal, cfg.sigColor);

      ctx.font = "600 9.5px -apple-system, sans-serif";
      ctx.fillStyle = "#8a8f9e";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(`MACD (${cfg.fast},${cfg.slow},${cfg.signal})`, 8, pane.top + 4);
      ctx.restore();

      const lastM = macdObj.macd[macdObj.macd.length - 1];
      if (lastM !== null && isFinite(lastM)) {
        const by = Math.max(pane.top + 10, Math.min(pane.bottom - 10, mapY(lastM)));
        roundRect(ctx, plotW + 2, by - 9, this.axisRightW - 4, 18, 3);
        ctx.fillStyle = cfg.macdColor;
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "700 9.5px -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(lastM.toFixed(1), plotW + this.axisRightW / 2, by);
      }
    }

    drawCrosshair(ctx, candles, dec, tf) {
      const ch = this.state.crosshair;
      const { plotW, totalH, main } = this.layout;
      const idx = Math.max(0, Math.min(candles.length - 1, ch.idx));
      const x = this.idxToX(idx);
      const y = Math.max(0, Math.min(totalH, ch.y));

      ctx.save();
      ctx.strokeStyle = "rgba(180, 185, 200, 0.5)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, 0); ctx.lineTo(x, totalH);
      ctx.moveTo(0, y); ctx.lineTo(plotW, y);
      ctx.stroke();
      ctx.restore();

      // Price Pill on Y-Axis if inside Main Pane
      if (y <= main.bottom) {
        const price = this.yToPrice(y);
        roundRect(ctx, plotW + 1, y - 10, this.axisRightW - 2, 20, 3);
        ctx.fillStyle = "#363c4e";
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "600 10px -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(fmtPrice(price, dec), plotW + this.axisRightW / 2, y);
      }

      // Time Pill on X-Axis
      const c = candles[idx];
      if (c) {
        const label = fmtTime(c.time, tf);
        drawPill(ctx, label, Math.max(40, Math.min(plotW - 40, x)), totalH + this.axisBottomH / 2, "#363c4e", "#ffffff", null, 10);
      }
    }
  }

  TV.CanvasRenderer = CanvasRenderer;
  TV.fmtPrice = fmtPrice;
  TV.fmtCompact = fmtCompact;
})(window.TVChart);
