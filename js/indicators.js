window.TVChart = window.TVChart || {};

(function (TV) {
  function safeRun(fn, fallback) {
    try { return fn(); } catch (e) { return fallback; }
  }

  function calcEMA(values, period) {
    const out = new Array(values.length).fill(null);
    if (values.length < period || period < 1) return out;
    const k = 2 / (period + 1);
    let sum = 0;
    for (let i = 0; i < period; i++) sum += values[i];
    let prev = sum / period;
    out[period - 1] = prev;
    for (let i = period; i < values.length; i++) {
      prev = values[i] * k + prev * (1 - k);
      out[i] = prev;
    }
    return out;
  }

  function calcSMA(values, period) {
    const out = new Array(values.length).fill(null);
    if (period < 1) return out;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v !== null && isFinite(v)) { sum += v; count++; }
      if (i >= period) {
        const old = values[i - period];
        if (old !== null && isFinite(old)) { sum -= old; count--; }
      }
      if (i >= period - 1 && count === period) out[i] = sum / period;
    }
    return out;
  }

  function findSwings(candles, len) {
    const swings = [];
    const n = candles.length;
    if (n < len * 2 + 1) return swings;
    for (let i = len; i < n - len; i++) {
      let isHigh = true;
      let isLow = true;
      const hi = candles[i].high;
      const lo = candles[i].low;
      for (let j = i - len; j <= i + len; j++) {
        if (j === i) continue;
        if (candles[j].high >= hi) isHigh = false;
        if (candles[j].low <= lo) isLow = false;
        if (!isHigh && !isLow) break;
      }
      if (isHigh) swings.push({ idx: i, type: "H", price: hi, time: candles[i].time });
      if (isLow) swings.push({ idx: i, type: "L", price: lo, time: candles[i].time });
    }
    return swings;
  }

  const IndicatorEngine = {
    computeAll(candles, cfg) {
      const res = {
        flow: [],
        rsi: { line: [], ma: [] },
        absCvd: { cvd: [], delta: [], signals: [] },
        vwapEma: { vwap: [], upper: [], lower: [], emaFast: [], emaSlow: [] },
        sr: { zones: [] },
        macd: { macd: [], signal: [], hist: [] },
        structure: { swings: [], breaks: [], bias: "NEUTRAL" },
        smcPro: { chochs: [], liqZones: [], sweeps: [], orderBlocks: [], entries: [] },
        patterns: []
      };
      if (!candles || !candles.length) return res;

      res.flow = safeRun(() => this.calcFlow(candles, cfg.btcFlow), []);
      res.rsi = safeRun(() => this.calcRSI(candles, cfg.rsi), res.rsi);
      res.absCvd = safeRun(() => this.calcAbsCvd(candles, res.flow, res.rsi.line, cfg.absCvd), res.absCvd);
      res.vwapEma = safeRun(() => this.calcVwapEma(candles, cfg.vwapEma), res.vwapEma);
      res.sr = safeRun(() => this.calcSR(candles, cfg.srLevels), res.sr);
      res.macd = safeRun(() => this.calcMACD(candles, cfg.macd), res.macd);
      res.structure = safeRun(() => this.calcStructure(candles, cfg.structure), res.structure);
      res.smcPro = safeRun(() => this.calcSmcPro(candles, cfg.smcPro), res.smcPro);
      res.patterns = safeRun(() => this.calcPatterns(candles, cfg.patterns), []);
      return res;
    },

    calcFlow(candles, cfg) {
      const mode = cfg.mode || "TAKER";
      return candles.map((c) => {
        const buy = mode === "TICK" ? c.tickBuy : c.takerBuy;
        const sell = mode === "TICK" ? c.tickSell : c.takerSell;
        const total = buy + sell;
        const buyPct = total > 0 ? (buy / total) * 100 : 50;
        const sellPct = total > 0 ? (sell / total) * 100 : 50;
        return { buy, sell, total, delta: buy - sell, buyPct, sellPct };
      });
    },

    calcRSI(candles, cfg) {
      const n = candles.length;
      const period = Math.max(2, cfg.period || 14);
      const line = new Array(n).fill(null);
      if (n <= period) return { line, ma: new Array(n).fill(null) };

      let gains = 0, losses = 0;
      for (let i = 1; i <= period; i++) {
        const diff = candles[i].close - candles[i - 1].close;
        if (diff >= 0) gains += diff;
        else losses -= diff;
      }
      let avgGain = gains / period;
      let avgLoss = losses / period;
      line[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

      for (let i = period + 1; i < n; i++) {
        const diff = candles[i].close - candles[i - 1].close;
        const g = diff > 0 ? diff : 0;
        const l = diff < 0 ? -diff : 0;
        avgGain = (avgGain * (period - 1) + g) / period;
        avgLoss = (avgLoss * (period - 1) + l) / period;
        line[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
      }
      const ma = calcSMA(line, Math.max(2, cfg.maPeriod || 14));
      return { line, ma };
    },

    calcAbsCvd(candles, flow, rsiLine, cfg) {
      const n = candles.length;
      const cvd = new Array(n).fill(0);
      const delta = new Array(n).fill(0);
      const signals = [];
      const vols = candles.map((c) => c.volume);
      const volSma = calcSMA(vols, Math.max(5, cfg.smaLen || 20));

      let running = 0;
      for (let i = 0; i < n; i++) {
        const f = flow[i] || { buy: 0, sell: 0, total: 0, delta: 0 };
        delta[i] = f.delta;
        running += f.delta;
        cvd[i] = running;

        const avgV = volSma[i];
        if (!avgV || avgV <= 0) continue;
        const c = candles[i];
        if (c.volume < avgV * (cfg.volMult || 1.4)) continue;

        const range = Math.max(1e-9, c.high - c.low);
        const lowerWick = (Math.min(c.open, c.close) - c.low) / range;
        const upperWick = (c.high - Math.max(c.open, c.close)) / range;
        const deltaPct = f.total > 0 ? (Math.abs(f.delta) / f.total) * 100 : 0;
        if (deltaPct < (cfg.minDeltaPct || 12)) continue;

        const isGreen = c.close >= c.open;
        const wickThr = cfg.wickRatio || 0.35;

        // Check RSI filter across last 3 candles
        let rsiAllowBull = true;
        let rsiAllowBear = true;
        if (cfg.rsiFilter) {
          rsiAllowBull = false;
          rsiAllowBear = false;
          for (let k = Math.max(0, i - 2); k <= i; k++) {
            const rv = rsiLine[k];
            if (rv !== null && rv <= (cfg.rsiOs || 35)) rsiAllowBull = true;
            if (rv !== null && rv >= (cfg.rsiOb || 65)) rsiAllowBear = true;
          }
        }

        // Bullish Absorption: Heavy negative delta (sellers) but green close or strong lower wick
        if (f.delta < 0 && (isGreen || lowerWick >= wickThr) && rsiAllowBull) {
          signals.push({ idx: i, dir: "bull", price: c.low, cvd: running });
        }
        // Bearish Absorption: Heavy positive delta (buyers) but red close or strong upper wick
        else if (f.delta > 0 && (!isGreen || upperWick >= wickThr) && rsiAllowBear) {
          signals.push({ idx: i, dir: "bear", price: c.high, cvd: running });
        }
      }
      return { cvd, delta, signals };
    },

    calcVwapEma(candles, cfg) {
      const n = candles.length;
      const closes = candles.map((c) => c.close);
      const emaFast = calcEMA(closes, Math.max(2, cfg.emaFast || 20));
      const emaSlow = calcEMA(closes, Math.max(2, cfg.emaSlow || 50));
      const vwap = new Array(n).fill(null);
      const upper = new Array(n).fill(null);
      const lower = new Array(n).fill(null);

      let cumPV = 0, cumV = 0, cumPV2 = 0, curDay = -1;
      for (let i = 0; i < n; i++) {
        const c = candles[i];
        const day = Math.floor(c.time / 86400000);
        if (day !== curDay) {
          cumPV = 0; cumV = 0; cumPV2 = 0; curDay = day;
        }
        const tp = (c.high + c.low + c.close) / 3;
        const v = Math.max(1e-9, c.volume);
        cumPV += tp * v;
        cumV += v;
        cumPV2 += tp * tp * v;
        const mean = cumPV / cumV;
        const variance = Math.max(0, cumPV2 / cumV - mean * mean);
        const std = Math.sqrt(variance);
        vwap[i] = mean;
        upper[i] = mean + std;
        lower[i] = mean - std;
      }
      return { vwap, upper, lower, emaFast, emaSlow };
    },

    calcSR(candles, cfg) {
      const swings = findSwings(candles, Math.max(3, cfg.pivotLen || 6));
      if (!swings.length) return { zones: [] };
      const lastClose = candles[candles.length - 1].close;
      const tol = lastClose * ((cfg.zonePct || 0.12) / 100);
      const clusters = [];

      swings.forEach((s) => {
        let matched = null;
        for (let i = 0; i < clusters.length; i++) {
          if (Math.abs(clusters[i].mid - s.price) <= tol * 2.2) {
            matched = clusters[i];
            break;
          }
        }
        if (matched) {
          matched.touches++;
          matched.min = Math.min(matched.min, s.price);
          matched.max = Math.max(matched.max, s.price);
          matched.mid = (matched.min + matched.max) / 2;
          matched.lastIdx = Math.max(matched.lastIdx, s.idx);
        } else {
          clusters.push({
            mid: s.price,
            min: s.price - tol * 0.5,
            max: s.price + tol * 0.5,
            touches: 1,
            firstIdx: s.idx,
            lastIdx: s.idx
          });
        }
      });

      clusters.sort((a, b) => b.touches - a.touches || b.lastIdx - a.lastIdx);
      const maxZones = Math.max(1, cfg.maxZones || 4);
      const picked = clusters.slice(0, maxZones).map((z) => ({
        min: z.min,
        max: z.max,
        mid: z.mid,
        touches: z.touches,
        type: z.mid >= lastClose ? "R" : "S"
      }));
      return { zones: picked };
    },

    calcMACD(candles, cfg) {
      const closes = candles.map((c) => c.close);
      const fast = calcEMA(closes, Math.max(2, cfg.fast || 12));
      const slow = calcEMA(closes, Math.max(3, cfg.slow || 26));
      const macd = closes.map((_, i) =>
        fast[i] !== null && slow[i] !== null ? fast[i] - slow[i] : null
      );
      const validStart = macd.findIndex((v) => v !== null);
      const sig = new Array(candles.length).fill(null);
      if (validStart !== -1) {
        const sub = macd.slice(validStart);
        const subSig = calcEMA(sub, Math.max(2, cfg.signal || 9));
        for (let i = 0; i < subSig.length; i++) sig[validStart + i] = subSig[i];
      }
      const hist = macd.map((m, i) => (m !== null && sig[i] !== null ? m - sig[i] : null));
      return { macd, signal: sig, hist };
    },

    calcStructure(candles, cfg) {
      const raw = findSwings(candles, Math.max(2, cfg.swingLen || 4));
      const labeled = [];
      let lastH = null, lastL = null;
      let bias = "NEUTRAL";
      const breaks = [];

      raw.forEach((s) => {
        if (s.type === "H") {
          const tag = !lastH ? "H" : s.price > lastH.price ? "HH" : "LH";
          labeled.push({ idx: s.idx, type: "H", price: s.price, tag });
          lastH = s;
        } else {
          const tag = !lastL ? "L" : s.price > lastL.price ? "HL" : "LL";
          labeled.push({ idx: s.idx, type: "L", price: s.price, tag });
          lastL = s;
        }
      });

      // Track BOS / CHoCH breaks across candles
      let activeHigh = null, activeLow = null;
      let swPtr = 0;
      for (let i = 0; i < candles.length; i++) {
        while (swPtr < raw.length && raw[swPtr].idx + (cfg.swingLen || 4) <= i) {
          const sw = raw[swPtr];
          if (sw.type === "H") activeHigh = { idx: sw.idx, price: sw.price, broken: false };
          else activeLow = { idx: sw.idx, price: sw.price, broken: false };
          swPtr++;
        }
        const c = candles[i];
        if (activeHigh && !activeHigh.broken && c.close > activeHigh.price) {
          activeHigh.broken = true;
          const kind = bias === "BEARISH" ? "CHoCH" : "BOS";
          bias = "BULLISH";
          breaks.push({ fromIdx: activeHigh.idx, toIdx: i, price: activeHigh.price, dir: "bull", kind });
        }
        if (activeLow && !activeLow.broken && c.close < activeLow.price) {
          activeLow.broken = true;
          const kind = bias === "BULLISH" ? "CHoCH" : "BOS";
          bias = "BEARISH";
          breaks.push({ fromIdx: activeLow.idx, toIdx: i, price: activeLow.price, dir: "bear", kind });
        }
      }

      return { swings: labeled, breaks: breaks.slice(-14), bias };
    },

    calcSmcPro(candles, cfg) {
      const len = Math.max(2, cfg.swingLen || 4);
      const swings = findSwings(candles, len);
      const chochs = [];
      const liqZones = [];
      const sweeps = [];
      const orderBlocks = [];
      const entries = [];
      const n = candles.length;
      if (n < 15) return { chochs, liqZones, sweeps, orderBlocks, entries };

      // 1. Dedicated CHoCH Detection + Order Blocks
      let trend = "NEUTRAL";
      let swingH = null, swingL = null;
      let swPtr = 0;

      for (let i = 0; i < n; i++) {
        while (swPtr < swings.length && swings[swPtr].idx + len <= i) {
          const sw = swings[swPtr];
          if (sw.type === "H") swingH = { idx: sw.idx, price: sw.price, broken: false };
          else swingL = { idx: sw.idx, price: sw.price, broken: false };
          swPtr++;
        }
        const c = candles[i];
        if (swingH && !swingH.broken && c.close > swingH.price) {
          swingH.broken = true;
          if (trend === "BEARISH") {
            chochs.push({ fromIdx: swingH.idx, toIdx: i, price: swingH.price, dir: "bull" });
            // Find last opposing red candle before impulse for Bull OB
            for (let k = i - 1; k >= Math.max(0, i - 12); k--) {
              if (candles[k].close < candles[k].open) {
                orderBlocks.push({
                  idx: k,
                  top: candles[k].high,
                  bottom: candles[k].low,
                  dir: "bull",
                  mitigatedIdx: null
                });
                break;
              }
            }
          }
          trend = "BULLISH";
        }
        if (swingL && !swingL.broken && c.close < swingL.price) {
          swingL.broken = true;
          if (trend === "BULLISH") {
            chochs.push({ fromIdx: swingL.idx, toIdx: i, price: swingL.price, dir: "bear" });
            for (let k = i - 1; k >= Math.max(0, i - 12); k--) {
              if (candles[k].close > candles[k].open) {
                orderBlocks.push({
                  idx: k,
                  top: candles[k].high,
                  bottom: candles[k].low,
                  dir: "bear",
                  mitigatedIdx: null
                });
                break;
              }
            }
          }
          trend = "BEARISH";
        }
      }

      // Check OB mitigation & Smart Money OB retest entries
      orderBlocks.forEach((ob) => {
        for (let j = ob.idx + 3; j < n; j++) {
          const c = candles[j];
          if (ob.dir === "bull" && c.low <= ob.top && c.close >= ob.bottom) {
            if (c.close > c.open && ob.mitigatedIdx === null) {
              entries.push({ idx: j, dir: "bull", price: c.low, reason: "OB" });
            }
            ob.mitigatedIdx = j;
            break;
          }
          if (ob.dir === "bear" && c.high >= ob.bottom && c.close <= ob.top) {
            if (c.close < c.open && ob.mitigatedIdx === null) {
              entries.push({ idx: j, dir: "bear", price: c.high, reason: "OB" });
            }
            ob.mitigatedIdx = j;
            break;
          }
        }
      });

      // 2. Liquidity Zones (EQH / EQL / BSL / SSL) & Wick Sweeps
      const eqTol = (cfg.eqTolPct || 0.05) / 100;
      const highs = swings.filter((s) => s.type === "H").slice(-16);
      const lows = swings.filter((s) => s.type === "L").slice(-16);

      const buildLiq = (list, side) => {
        const used = new Set();
        for (let i = list.length - 1; i >= 0; i--) {
          if (used.has(i)) continue;
          const a = list[i];
          let isEq = false;
          let startIdx = a.idx;
          let price = a.price;

          for (let j = i - 1; j >= 0; j--) {
            const b = list[j];
            if (Math.abs(a.price - b.price) / a.price <= eqTol) {
              isEq = true;
              used.add(j);
              startIdx = b.idx;
              price = side === "BSL" ? Math.max(a.price, b.price) : Math.min(a.price, b.price);
              break;
            }
          }

          // Check if swept later
          let sweptIdx = null;
          for (let k = a.idx + 2; k < n; k++) {
            const c = candles[k];
            if (side === "BSL" && c.high > price) {
              sweptIdx = k;
              // Bearish sweep rejection if candle closes back below liquidity
              if (c.close < price) {
                sweeps.push({ idx: k, dir: "bear", price: c.high });
                if (c.close < c.open) {
                  entries.push({ idx: k, dir: "bear", price: c.high, reason: "SWEEP" });
                }
              }
              break;
            }
            if (side === "SSL" && c.low < price) {
              sweptIdx = k;
              if (c.close > price) {
                sweeps.push({ idx: k, dir: "bull", price: c.low });
                if (c.close > c.open) {
                  entries.push({ idx: k, dir: "bull", price: c.low, reason: "SWEEP" });
                }
              }
              break;
            }
          }

          if (sweptIdx === null || sweptIdx > n - 35) {
            liqZones.push({
              side,
              label: isEq ? (side === "BSL" ? "$$$ EQH" : "$$$ EQL") : (side === "BSL" ? "$$$ BSL" : "$$$ SSL"),
              price,
              startIdx,
              endIdx: sweptIdx !== null ? sweptIdx : n - 1,
              swept: sweptIdx !== null
            });
          }
        }
      };

      buildLiq(highs, "BSL");
      buildLiq(lows, "SSL");

      // Deduplicate entries on same candle
      const entryMap = new Map();
      entries.forEach((e) => entryMap.set(e.idx + "_" + e.dir, e));

      return {
        chochs: chochs.slice(-8),
        liqZones: liqZones.slice(0, Math.max(2, (cfg.maxLiq || 4) * 2)),
        sweeps: sweeps.slice(-8),
        orderBlocks: orderBlocks.slice(-(cfg.maxOb || 3)),
        entries: Array.from(entryMap.values()).slice(-6)
      };
    },

    calcPatterns(candles, cfg) {
      const patterns = [];
      const n = candles.length;
      if (n < 25) return patterns;

      const raw = findSwings(candles, Math.max(2, cfg.swingLen || 3));
      // Alternate H / L pivots cleanly
      const pivots = [];
      raw.forEach((p) => {
        if (!pivots.length) { pivots.push(p); return; }
        const prev = pivots[pivots.length - 1];
        if (prev.type === p.type) {
          if ((p.type === "H" && p.price > prev.price) || (p.type === "L" && p.price < prev.price)) {
            pivots[pivots.length - 1] = p;
          }
        } else {
          pivots.push(p);
        }
      });

      const recent = pivots.slice(-14);
      const lastClose = candles[n - 1].close;

      // 1. W (Double Bottom) & M (Double Top)
      if (cfg.showWM && recent.length >= 3) {
        for (let i = recent.length - 3; i >= 0; i--) {
          const p1 = recent[i], p2 = recent[i + 1], p3 = recent[i + 2];
          if (n - p3.idx > 65) break;
          // W Pattern: L - H - L
          if (p1.type === "L" && p2.type === "H" && p3.type === "L") {
            const diff = Math.abs(p1.price - p3.price) / p1.price;
            const height = p2.price - Math.min(p1.price, p3.price);
            if (diff <= 0.0045 && height > 0) {
              const confirmed = lastClose > p2.price;
              patterns.push({
                kind: "WM",
                name: confirmed ? "W Double Bottom" : "Forming W",
                dir: "bull",
                confirmed,
                points: [p1, p2, p3],
                neckline: p2.price,
                target: p2.price + height
              });
              break;
            }
          }
          // M Pattern: H - L - H
          if (p1.type === "H" && p2.type === "L" && p3.type === "H") {
            const diff = Math.abs(p1.price - p3.price) / p1.price;
            const height = Math.max(p1.price, p3.price) - p2.price;
            if (diff <= 0.0045 && height > 0) {
              const confirmed = lastClose < p2.price;
              patterns.push({
                kind: "WM",
                name: confirmed ? "M Double Top" : "Forming M",
                dir: "bear",
                confirmed,
                points: [p1, p2, p3],
                neckline: p2.price,
                target: p2.price - height
              });
              break;
            }
          }
        }
      }

      // 2. Triangles / Wedges (4+ alternating pivots converging)
      if (cfg.showTriangles && recent.length >= 4) {
        const p = recent.slice(-4);
        const highs = p.filter((x) => x.type === "H");
        const lows = p.filter((x) => x.type === "L");
        if (highs.length === 2 && lows.length === 2 && n - p[3].idx <= 55) {
          const hSlope = (highs[1].price - highs[0].price) / Math.max(1, highs[1].idx - highs[0].idx);
          const lSlope = (lows[1].price - lows[0].price) / Math.max(1, lows[1].idx - lows[0].idx);
          const spanStart = Math.abs(highs[0].price - lows[0].price);
          const spanEnd = Math.abs(highs[1].price - lows[1].price);

          if (spanEnd < spanStart * 0.92 && spanEnd > 0) {
            let name = "Sym Triangle";
            let dir = "neutral";
            if (Math.abs(hSlope) < Math.abs(lSlope) * 0.25 && lSlope > 0) {
              name = "Asc Triangle"; dir = "bull";
            } else if (Math.abs(lSlope) < Math.abs(hSlope) * 0.25 && hSlope < 0) {
              name = "Desc Triangle"; dir = "bear";
            } else if (hSlope > 0 && lSlope > 0) {
              name = "Rising Wedge"; dir = "bear";
            } else if (hSlope < 0 && lSlope < 0) {
              name = "Falling Wedge"; dir = "bull";
            }
            patterns.push({
              kind: "TRI",
              name,
              dir,
              confirmed: false,
              highs,
              lows,
              points: p
            });
          }
        }
      }

      // 3. Head & Shoulders / Inverse H&S (5 pivots)
      if (cfg.showHS && recent.length >= 5) {
        for (let i = recent.length - 5; i >= 0; i--) {
          const a = recent[i], b = recent[i + 1], c = recent[i + 2], d = recent[i + 3], e = recent[i + 4];
          if (n - e.idx > 70) break;
          // Bearish H&S: H - L - Higher H - L - Lower H
          if (a.type === "H" && b.type === "L" && c.type === "H" && d.type === "L" && e.type === "H") {
            const shoulderDiff = Math.abs(a.price - e.price) / c.price;
            if (c.price > a.price && c.price > e.price && shoulderDiff <= 0.006) {
              const neck = (b.price + d.price) / 2;
              const confirmed = lastClose < neck;
              patterns.push({
                kind: "HS",
                name: confirmed ? "Head & Shoulders" : "Forming H&S",
                dir: "bear",
                confirmed,
                points: [a, b, c, d, e],
                tags: ["LS", "", "H", "", "RS"],
                neckline: neck,
                target: neck - (c.price - neck)
              });
              break;
            }
          }
          // Bullish Inverse H&S: L - H - Lower L - H - Higher L
          if (a.type === "L" && b.type === "H" && c.type === "L" && d.type === "H" && e.type === "L") {
            const shoulderDiff = Math.abs(a.price - e.price) / c.price;
            if (c.price < a.price && c.price < e.price && shoulderDiff <= 0.006) {
              const neck = (b.price + d.price) / 2;
              const confirmed = lastClose > neck;
              patterns.push({
                kind: "HS",
                name: confirmed ? "Inv H&S" : "Forming Inv H&S",
                dir: "bull",
                confirmed,
                points: [a, b, c, d, e],
                tags: ["LS", "", "H", "", "RS"],
                neckline: neck,
                target: neck + (neck - c.price)
              });
              break;
            }
          }
        }
      }

      return patterns.slice(0, Math.max(1, cfg.maxPatterns || 3));
    }
  };

  TV.IndicatorEngine = IndicatorEngine;
})(window.TVChart);
