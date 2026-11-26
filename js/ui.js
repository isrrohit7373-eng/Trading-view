window.TVChart = window.TVChart || {};

(function (TV) {
  const INDICATOR_META = [
    { key: "btcFlow", tab: "BTC Flow", title: "BTC Flow (Buy/Sell)", desc: "Per-candle Buy/Sell qty, %, and split volume bars" },
    { key: "absCvd", tab: "ABS+CVD", title: "Absorption & CVD", desc: "Limit-order absorption badges + bottom CVD pane" },
    { key: "rsi", tab: "RSI", title: "RSI (14)", desc: "Relative Strength Index sub-pane with 70/30 zones" },
    { key: "vwapEma", tab: "VWAP·EMA", title: "VWAP + EMA 20/50", desc: "Session VWAP with Fast & Slow trend EMAs" },
    { key: "srLevels", tab: "S/R", title: "Support & Resistance", desc: "Auto pivot zones with touch counts" },
    { key: "macd", tab: "MACD", title: "MACD (12,26,9)", desc: "4-color momentum histogram + MACD/Signal lines" },
    { key: "structure", tab: "Structure", title: "Market Structure", desc: "HH/HL/LH/LL swings, BOS lines & live Bias" },
    { key: "smcPro", tab: "SMC Pro", title: "SMC Pro (CHoCH · Liq)", desc: "CHoCH lines, BSL/SSL Liquidity, Sweeps, OB & Entries" },
    { key: "patterns", tab: "Patterns", title: "Chart Patterns", desc: "Live W/M, Triangles/Wedges & Head & Shoulders" }
  ];

  class UIController {
    constructor(state, actions) {
      this.state = state;
      this.actions = actions;
      this.activeTab = "ALL";
      this.el = {
        app: document.getElementById("app"),
        coinIcon: document.getElementById("coinIcon"),
        coinName: document.getElementById("coinName"),
        liveDot: document.getElementById("liveDot"),
        valO: document.getElementById("valO"),
        valH: document.getElementById("valH"),
        valL: document.getElementById("valL"),
        valC: document.getElementById("valC"),
        valChg: document.getElementById("valChg"),
        volUnit: document.getElementById("volUnit"),
        valVol: document.getElementById("valVol"),
        fxCount: document.getElementById("fxCount"),
        biasPill: document.getElementById("biasPill"),
        fxPopoverBtn: document.getElementById("fxPopoverBtn"),
        fxPopover: document.getElementById("fxPopover"),
        fxPopoverList: document.getElementById("fxPopoverList"),
        openMasterFromPopover: document.getElementById("openMasterFromPopover"),
        statusToast: document.getElementById("statusToast"),
        jumpLatestBtn: document.getElementById("jumpLatestBtn"),
        autoFitBadge: document.getElementById("autoFitBadge"),
        restoreHudBtn: document.getElementById("restoreHudBtn"),
        pillCoinIcon: document.getElementById("pillCoinIcon"),
        pillSymText: document.getElementById("pillSymText"),
        pillTfText: document.getElementById("pillTfText"),
        symbolSheetBtn: document.getElementById("symbolSheetBtn"),
        headerSymbolBtn: document.getElementById("headerSymbolBtn"),
        crosshairBtn: document.getElementById("crosshairBtn"),
        indicatorsBtn: document.getElementById("indicatorsBtn"),
        cleanChartBtn: document.getElementById("cleanChartBtn"),
        cleanChartTopBtn: document.getElementById("cleanChartTopBtn"),
        autoBtn: document.getElementById("autoBtn"),
        resetViewBtn: document.getElementById("resetViewBtn"),
        sheetBackdrop: document.getElementById("sheetBackdrop"),
        symbolSheet: document.getElementById("symbolSheet"),
        settingsSheet: document.getElementById("settingsSheet"),
        symbolChipGrid: document.getElementById("symbolChipGrid"),
        tfChipGrid: document.getElementById("tfChipGrid"),
        settingsTabs: document.getElementById("settingsTabs"),
        settingsBody: document.getElementById("settingsBody")
      };

      this.bindEvents();
      this.renderSymbolSheet();
      this.applyCleanMode();
      this.updateSymbolHeader();
    }

    bindEvents() {
      const openSym = () => this.openSheet("symbolSheet");
      this.el.symbolSheetBtn.addEventListener("click", openSym);
      this.el.headerSymbolBtn.addEventListener("click", openSym);

      this.el.fxPopoverBtn.addEventListener("click", () => {
        this.el.fxPopover.classList.toggle("hidden");
        if (!this.el.fxPopover.classList.contains("hidden")) this.renderPopover();
      });

      this.el.openMasterFromPopover.addEventListener("click", () => {
        this.el.fxPopover.classList.add("hidden");
        this.openSettings("ALL");
      });

      this.el.indicatorsBtn.addEventListener("click", () => this.openSettings("ALL"));

      const toggleClean = () => {
        TV.ConfigStore.data.cleanMode = !TV.ConfigStore.data.cleanMode;
        TV.ConfigStore.save();
        this.applyCleanMode();
      };
      this.el.cleanChartBtn.addEventListener("click", toggleClean);
      this.el.cleanChartTopBtn.addEventListener("click", toggleClean);
      this.el.restoreHudBtn.addEventListener("click", toggleClean);

      this.el.crosshairBtn.addEventListener("click", () => {
        const ch = this.state.crosshair;
        ch.locked = !ch.locked;
        ch.active = ch.locked;
        if (ch.active && this.state.candles.length) {
          ch.idx = this.state.candles.length - 1;
          ch.y = 140;
        }
        this.el.crosshairBtn.classList.toggle("active", ch.locked);
        this.state.needsRender = true;
        this.updateHUD();
      });

      const toggleAuto = () => {
        this.actions.setAutoFit(!this.state.view.autoFit);
      };
      this.el.autoBtn.addEventListener("click", toggleAuto);
      this.el.autoFitBadge.addEventListener("click", toggleAuto);

      this.el.resetViewBtn.addEventListener("click", () => this.actions.resetView());
      this.el.jumpLatestBtn.addEventListener("click", () => this.actions.jumpLatest());

      this.el.sheetBackdrop.addEventListener("click", () => this.closeSheets());
      document.querySelectorAll(".sheet-close").forEach((btn) => {
        btn.addEventListener("click", () => this.closeSheets());
      });
    }

    applyCleanMode() {
      const clean = !!TV.ConfigStore.data.cleanMode;
      this.el.app.classList.toggle("clean-mode", clean);
      this.el.restoreHudBtn.classList.toggle("hidden", !clean);
      this.el.cleanChartBtn.classList.toggle("active", clean);
      if (clean) this.el.fxPopover.classList.add("hidden");
    }

    setStatus(state, msg) {
      this.el.liveDot.className = "live-dot " + (state === "live" ? "live" : state === "err" ? "err" : "");
      if (msg) {
        this.el.statusToast.textContent = msg;
        this.el.statusToast.classList.remove("hidden");
      } else {
        this.el.statusToast.classList.add("hidden");
      }
    }

    setAutoFitUI(isAuto) {
      this.el.autoBtn.classList.toggle("active", isAuto);
      this.el.autoFitBadge.classList.toggle("active", isAuto);
    }

    updateSymbolHeader() {
      const cfg = TV.ConfigStore.data;
      const meta = TV.ConfigStore.getSymbolMeta(cfg.symbol);
      this.el.coinIcon.textContent = meta.icon;
      this.el.coinIcon.style.background = meta.color;
      this.el.coinName.textContent = meta.label;
      this.el.volUnit.textContent = meta.base;
      this.el.pillCoinIcon.textContent = meta.icon;
      this.el.pillCoinIcon.style.background = meta.color;
      this.el.pillSymText.textContent = meta.short;
      this.el.pillTfText.textContent = cfg.timeframe;
    }

    updateHUD() {
      const candles = this.state.candles;
      const cfg = TV.ConfigStore.data;
      const ind = this.state.indicators;

      // Active count
      const activeCount = INDICATOR_META.filter((m) => cfg[m.key] && cfg[m.key].enabled).length;
      this.el.fxCount.textContent = `${activeCount}/${INDICATOR_META.length}`;

      // Jump to latest visibility
      this.el.jumpLatestBtn.classList.toggle("hidden", this.state.view.rightOffset > -8);

      // Market Bias Pill
      const bias = (ind.structure && ind.structure.bias) || "NEUTRAL";
      this.el.biasPill.textContent = `● ${bias}`;
      this.el.biasPill.className =
        "bias-pill " + (bias === "BULLISH" ? "bull" : bias === "BEARISH" ? "bear" : "neutral");

      if (!candles.length) return;
      const idx = this.state.crosshair.active
        ? Math.max(0, Math.min(candles.length - 1, this.state.crosshair.idx))
        : candles.length - 1;
      const c = candles[idx];
      const meta = TV.ConfigStore.getSymbolMeta(cfg.symbol);
      const up = c.close >= c.open;
      const cls = up ? "up" : "dn";

      this.el.valO.textContent = TV.fmtPrice(c.open, meta.decimals);
      this.el.valH.textContent = TV.fmtPrice(c.high, meta.decimals);
      this.el.valL.textContent = TV.fmtPrice(c.low, meta.decimals);
      this.el.valC.textContent = TV.fmtPrice(c.close, meta.decimals);
      ["valO", "valH", "valL", "valC"].forEach((id) => {
        this.el[id].parentElement.className = "ohlc-item " + cls;
      });

      const pct = c.open > 0 ? ((c.close - c.open) / c.open) * 100 : 0;
      this.el.valChg.textContent = `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
      this.el.valChg.className = "ohlc-chg " + cls;
      this.el.valVol.textContent = TV.fmtCompact(c.volume, 2);

      if (!this.el.fxPopover.classList.contains("hidden")) {
        this.renderPopover(idx);
      }
    }

    renderPopover(idxOverride) {
      const cfg = TV.ConfigStore.data;
      const ind = this.state.indicators;
      const candles = this.state.candles;
      const idx = idxOverride !== undefined ? idxOverride : Math.max(0, candles.length - 1);

      const getVal = (key) => {
        if (!candles.length) return "--";
        if (key === "btcFlow" && ind.flow[idx]) {
          const f = ind.flow[idx];
          return `B ${TV.fmtCompact(f.buy, 2)} (${Math.round(f.buyPct)}%) · S ${TV.fmtCompact(f.sell, 2)} (${Math.round(f.sellPct)}%)`;
        }
        if (key === "absCvd" && ind.absCvd.cvd.length) {
          const v = ind.absCvd.cvd[idx] || 0;
          return `CVD ${v >= 0 ? "+" : ""}${TV.fmtCompact(v, 1)} · ${ind.absCvd.signals.length} signals`;
        }
        if (key === "rsi" && ind.rsi.line[idx] !== null && ind.rsi.line[idx] !== undefined) {
          return `RSI ${ind.rsi.line[idx].toFixed(1)}`;
        }
        if (key === "vwapEma" && ind.vwapEma.vwap[idx]) {
          return `VWAP ${TV.fmtPrice(ind.vwapEma.vwap[idx], 1)}`;
        }
        if (key === "srLevels") return `${(ind.sr.zones || []).length} active zones`;
        if (key === "macd" && ind.macd.macd[idx] !== null && ind.macd.macd[idx] !== undefined) {
          return `MACD ${ind.macd.macd[idx].toFixed(1)}`;
        }
        if (key === "structure") return `Bias: ${ind.structure.bias}`;
        if (key === "smcPro") {
          const s = ind.smcPro;
          return `${s.chochs.length} CHoCH · ${s.liqZones.length} Liq · ${s.entries.length} Entries`;
        }
        if (key === "patterns") {
          return ind.patterns.length ? ind.patterns.map((p) => p.name).join(", ") : "Scanning…";
        }
        return "Active";
      };

      this.el.fxPopoverList.innerHTML = "";
      INDICATOR_META.forEach((m) => {
        const on = cfg[m.key].enabled;
        const row = document.createElement("div");
        row.className = "fx-pop-row" + (on ? "" : " off");
        row.innerHTML = `
          <div class="fx-pop-left">
            <span class="fx-pop-name">${m.tab}</span>
            <span class="fx-pop-val">${getVal(m.key)}</span>
          </div>
          <div class="fx-pop-actions">
            <button class="mini-icon-btn" data-eye="${m.key}" title="Toggle">${on ? "👁" : "⊘"}</button>
            <button class="mini-icon-btn" data-gear="${m.key}" title="Settings">⚙</button>
          </div>
        `;
        row.querySelector("[data-eye]").addEventListener("click", () => {
          cfg[m.key].enabled = !cfg[m.key].enabled;
          TV.ConfigStore.save();
          this.actions.recompute();
          this.renderPopover(idx);
        });
        row.querySelector("[data-gear]").addEventListener("click", () => {
          this.el.fxPopover.classList.add("hidden");
          this.openSettings(m.key);
        });
        this.el.fxPopoverList.appendChild(row);
      });
    }

    openSheet(sheetId) {
      this.closeSheets();
      this.el.sheetBackdrop.classList.remove("hidden");
      this.el[sheetId].classList.remove("hidden");
    }

    closeSheets() {
      this.el.sheetBackdrop.classList.add("hidden");
      this.el.symbolSheet.classList.add("hidden");
      this.el.settingsSheet.classList.add("hidden");
    }

    renderSymbolSheet() {
      const cfg = TV.ConfigStore.data;
      this.el.symbolChipGrid.innerHTML = "";
      TV.ConfigStore.SYMBOLS.forEach((s) => {
        const btn = document.createElement("button");
        btn.className = "chip-btn" + (cfg.symbol === s.id ? " active" : "");
        btn.textContent = `${s.icon} ${s.short}`;
        btn.addEventListener("click", () => {
          cfg.symbol = s.id;
          TV.ConfigStore.save();
          this.renderSymbolSheet();
          this.updateSymbolHeader();
          this.closeSheets();
          this.actions.loadSymbol(cfg.symbol, cfg.timeframe);
        });
        this.el.symbolChipGrid.appendChild(btn);
      });

      this.el.tfChipGrid.innerHTML = "";
      TV.ConfigStore.TIMEFRAMES.forEach((tf) => {
        const btn = document.createElement("button");
        btn.className = "chip-btn" + (cfg.timeframe === tf ? " active" : "");
        btn.textContent = tf;
        btn.addEventListener("click", () => {
          cfg.timeframe = tf;
          TV.ConfigStore.save();
          this.renderSymbolSheet();
          this.updateSymbolHeader();
          this.closeSheets();
          this.actions.loadSymbol(cfg.symbol, cfg.timeframe);
        });
        this.el.tfChipGrid.appendChild(btn);
      });
    }

    openSettings(tabKey) {
      this.activeTab = tabKey || "ALL";
      this.renderSettingsTabs();
      this.renderSettingsBody();
      this.openSheet("settingsSheet");
    }

    renderSettingsTabs() {
      const tabs = [{ key: "ALL", tab: "ALL" }].concat(INDICATOR_META);
      this.el.settingsTabs.innerHTML = "";
      tabs.forEach((t) => {
        const btn = document.createElement("button");
        btn.className = "tab-pill" + (this.activeTab === t.key ? " active" : "");
        btn.textContent = t.tab;
        btn.addEventListener("click", () => {
          this.activeTab = t.key;
          this.renderSettingsTabs();
          this.renderSettingsBody();
        });
        this.el.settingsTabs.appendChild(btn);
      });
    }

    addToggle(parent, label, sub, value, onChange) {
      const row = document.createElement("div");
      row.className = "setting-row";
      row.innerHTML = `
        <div><div class="setting-label">${label}</div>${sub ? `<div class="setting-sub">${sub}</div>` : ""}</div>
        <label class="switch"><input type="checkbox" ${value ? "checked" : ""}><span class="slider"></span></label>
      `;
      row.querySelector("input").addEventListener("change", (e) => {
        onChange(e.target.checked);
        TV.ConfigStore.save();
        this.actions.recompute();
      });
      parent.appendChild(row);
    }

    addNumber(parent, label, value, min, max, step, onChange) {
      const row = document.createElement("div");
      row.className = "setting-row";
      row.innerHTML = `
        <div class="setting-label">${label}</div>
        <div class="setting-control">
          <input class="setting-input" type="number" value="${value}" min="${min}" max="${max}" step="${step}" />
        </div>
      `;
      row.querySelector("input").addEventListener("change", (e) => {
        const v = parseFloat(e.target.value);
        if (isFinite(v)) {
          onChange(Math.max(min, Math.min(max, v)));
          TV.ConfigStore.save();
          this.actions.recompute();
        }
      });
      parent.appendChild(row);
    }

    addSelect(parent, label, value, options, onChange) {
      const row = document.createElement("div");
      row.className = "setting-row";
      const opts = options.map((o) => `<option value="${o.v}" ${o.v === value ? "selected" : ""}>${o.l}</option>`).join("");
      row.innerHTML = `
        <div class="setting-label">${label}</div>
        <select class="setting-select">${opts}</select>
      `;
      row.querySelector("select").addEventListener("change", (e) => {
        onChange(e.target.value);
        TV.ConfigStore.save();
        this.actions.recompute();
      });
      parent.appendChild(row);
    }

    addColor(parent, label, value, onChange) {
      const row = document.createElement("div");
      row.className = "setting-row";
      row.innerHTML = `
        <div class="setting-label">${label}</div>
        <input class="setting-input" type="color" value="${value}" />
      `;
      row.querySelector("input").addEventListener("input", (e) => {
        onChange(e.target.value);
        TV.ConfigStore.save();
        this.state.needsRender = true;
      });
      parent.appendChild(row);
    }

    renderSettingsBody() {
      const body = this.el.settingsBody;
      const cfg = TV.ConfigStore.data;
      body.innerHTML = "";

      if (this.activeTab === "ALL") {
        const acts = document.createElement("div");
        acts.className = "master-actions";
        acts.innerHTML = `
          <button class="action-btn" id="btnShowAll">Show All</button>
          <button class="action-btn" id="btnHideAll">Hide All</button>
          <button class="action-btn danger" id="btnResetAll">Reset All</button>
        `;
        body.appendChild(acts);
        acts.querySelector("#btnShowAll").addEventListener("click", () => {
          INDICATOR_META.forEach((m) => (cfg[m.key].enabled = true));
          TV.ConfigStore.save();
          this.actions.recompute();
          this.renderSettingsBody();
        });
        acts.querySelector("#btnHideAll").addEventListener("click", () => {
          INDICATOR_META.forEach((m) => (cfg[m.key].enabled = false));
          TV.ConfigStore.save();
          this.actions.recompute();
          this.renderSettingsBody();
        });
        acts.querySelector("#btnResetAll").addEventListener("click", () => {
          TV.ConfigStore.resetSection(null);
          this.applyCleanMode();
          this.actions.recompute();
          this.renderSettingsBody();
        });

        INDICATOR_META.forEach((m) => {
          const card = document.createElement("div");
          card.className = "master-card";
          card.innerHTML = `
            <div class="master-card-info">
              <div class="master-card-title">${m.title}</div>
              <div class="master-card-sub">${m.desc}</div>
            </div>
            <div class="master-card-right">
              <button class="tune-btn">Tune</button>
              <label class="switch"><input type="checkbox" ${cfg[m.key].enabled ? "checked" : ""}><span class="slider"></span></label>
            </div>
          `;
          card.querySelector(".tune-btn").addEventListener("click", () => {
            this.activeTab = m.key;
            this.renderSettingsTabs();
            this.renderSettingsBody();
          });
          card.querySelector("input").addEventListener("change", (e) => {
            cfg[m.key].enabled = e.target.checked;
            TV.ConfigStore.save();
            this.actions.recompute();
          });
          body.appendChild(card);
        });
        return;
      }

      const key = this.activeTab;
      const sec = cfg[key];
      this.addToggle(body, "Enable Indicator", "", sec.enabled, (v) => (sec.enabled = v));

      if (key === "btcFlow") {
        this.addSelect(body, "Tracking Mode", sec.mode, [
          { v: "TAKER", l: "Taker Flow (Exact)" },
          { v: "TICK", l: "Price-Tick (Up/Down)" }
        ], (v) => (sec.mode = v));
        this.addToggle(body, "On-Chart Buy/Sell Labels", "Upside Buy & downside Sell qty + %", sec.showLabels, (v) => (sec.showLabels = v));
        this.addToggle(body, "Split Buy/Sell Volume Bars", "", sec.showSplitVol, (v) => (sec.showSplitVol = v));
        this.addNumber(body, "Min Dominance %", sec.minDomPct, 50, 95, 1, (v) => (sec.minDomPct = v));
        this.addNumber(body, "Min Volume Filter", sec.minVol, 0, 1000, 0.5, (v) => (sec.minVol = v));
        this.addNumber(body, "Label Font Size", sec.fontSize, 7, 13, 1, (v) => (sec.fontSize = v));
        this.addColor(body, "Buy Color", sec.buyColor, (v) => (sec.buyColor = v));
        this.addColor(body, "Sell Color", sec.sellColor, (v) => (sec.sellColor = v));
      } else if (key === "absCvd") {
        this.addToggle(body, "Show ABS ↑ / ABS ↓ Badges", "", sec.showMarkers, (v) => (sec.showMarkers = v));
        this.addToggle(body, "Candle Absorption Halo", "", sec.showHalo, (v) => (sec.showHalo = v));
        this.addToggle(body, "Bottom CVD Sub-Pane", "", sec.showSubPane, (v) => (sec.showSubPane = v));
        this.addToggle(body, "High-Probability RSI Filter", "Only fire ABS near OB/OS zones", sec.rsiFilter, (v) => (sec.rsiFilter = v));
        this.addNumber(body, "Volume Spike Multiplier", sec.volMult, 1.0, 5.0, 0.1, (v) => (sec.volMult = v));
        this.addNumber(body, "Min Delta Imbalance %", sec.minDeltaPct, 5, 60, 1, (v) => (sec.minDeltaPct = v));
        this.addNumber(body, "RSI Filter OB Level", sec.rsiOb, 55, 85, 1, (v) => (sec.rsiOb = v));
        this.addNumber(body, "RSI Filter OS Level", sec.rsiOs, 15, 45, 1, (v) => (sec.rsiOs = v));
        this.addColor(body, "CVD Line Color", sec.cvdColor, (v) => (sec.cvdColor = v));
      } else if (key === "rsi") {
        this.addNumber(body, "RSI Period", sec.period, 2, 50, 1, (v) => (sec.period = v));
        this.addToggle(body, "Show RSI Moving Average", "", sec.showMa, (v) => (sec.showMa = v));
        this.addNumber(body, "MA Period", sec.maPeriod, 2, 50, 1, (v) => (sec.maPeriod = v));
        this.addNumber(body, "Overbought Level", sec.ob, 55, 90, 1, (v) => (sec.ob = v));
        this.addNumber(body, "Oversold Level", sec.os, 10, 45, 1, (v) => (sec.os = v));
        this.addColor(body, "RSI Line Color", sec.lineColor, (v) => (sec.lineColor = v));
      } else if (key === "vwapEma") {
        this.addToggle(body, "Session VWAP (00:00 UTC)", "", sec.showVwap, (v) => (sec.showVwap = v));
        this.addToggle(body, "VWAP ±1σ Bands", "", sec.showBands, (v) => (sec.showBands = v));
        this.addToggle(body, "Show Fast EMA", "", sec.showEmaFast, (v) => (sec.showEmaFast = v));
        this.addNumber(body, "Fast EMA Length", sec.emaFast, 2, 200, 1, (v) => (sec.emaFast = v));
        this.addToggle(body, "Show Slow EMA", "", sec.showEmaSlow, (v) => (sec.showEmaSlow = v));
        this.addNumber(body, "Slow EMA Length", sec.emaSlow, 5, 300, 1, (v) => (sec.emaSlow = v));
        this.addColor(body, "VWAP Color", sec.vwapColor, (v) => (sec.vwapColor = v));
      } else if (key === "srLevels") {
        this.addNumber(body, "Pivot Lookback", sec.pivotLen, 3, 20, 1, (v) => (sec.pivotLen = v));
        this.addNumber(body, "Max Active Zones", sec.maxZones, 1, 8, 1, (v) => (sec.maxZones = v));
        this.addToggle(body, "Show Touch Count Labels", "", sec.showLabels, (v) => (sec.showLabels = v));
        this.addColor(body, "Support Color", sec.supColor, (v) => (sec.supColor = v));
        this.addColor(body, "Resistance Color", sec.resColor, (v) => (sec.resColor = v));
      } else if (key === "macd") {
        this.addNumber(body, "Fast Length", sec.fast, 2, 50, 1, (v) => (sec.fast = v));
        this.addNumber(body, "Slow Length", sec.slow, 5, 100, 1, (v) => (sec.slow = v));
        this.addNumber(body, "Signal Smoothing", sec.signal, 2, 50, 1, (v) => (sec.signal = v));
        this.addColor(body, "MACD Color", sec.macdColor, (v) => (sec.macdColor = v));
        this.addColor(body, "Signal Color", sec.sigColor, (v) => (sec.sigColor = v));
      } else if (key === "structure") {
        this.addNumber(body, "Swing Length", sec.swingLen, 2, 12, 1, (v) => (sec.swingLen = v));
        this.addToggle(body, "Show HH/HL/LH/LL Labels", "", sec.showSwings, (v) => (sec.showSwings = v));
        this.addToggle(body, "Show BOS Lines", "", sec.showBos, (v) => (sec.showBos = v));
      } else if (key === "smcPro") {
        this.addNumber(body, "Swing Sensitivity", sec.swingLen, 2, 10, 1, (v) => (sec.swingLen = v));
        this.addToggle(body, "Change of Character (CHoCH)", "High-visibility dashed break lines", sec.showChoch, (v) => (sec.showChoch = v));
        this.addToggle(body, "Liquidity Zones (BSL/SSL/EQ)", "", sec.showLiq, (v) => (sec.showLiq = v));
        this.addToggle(body, "Liquidity Sweeps (SWEEP ↑/↓)", "", sec.showSweeps, (v) => (sec.showSweeps = v));
        this.addToggle(body, "Order Blocks (Bull/Bear OB)", "", sec.showOb, (v) => (sec.showOb = v));
        this.addToggle(body, "Smart Money Entries", "SM LONG ↑ / SM SHORT ↓ setups", sec.showEntries, (v) => (sec.showEntries = v));
        this.addNumber(body, "Max Liquidity Zones", sec.maxLiq, 1, 8, 1, (v) => (sec.maxLiq = v));
      } else if (key === "patterns") {
        this.addNumber(body, "Pivot Sensitivity", sec.swingLen, 2, 8, 1, (v) => (sec.swingLen = v));
        this.addToggle(body, "W / M (Double Bottom & Top)", "", sec.showWM, (v) => (sec.showWM = v));
        this.addToggle(body, "Triangles & Wedges", "", sec.showTriangles, (v) => (sec.showTriangles = v));
        this.addToggle(body, "Head & Shoulders / Inv H&S", "", sec.showHS, (v) => (sec.showHS = v));
        this.addToggle(body, "Show Projected TP Targets", "", sec.showTargets, (v) => (sec.showTargets = v));
        this.addNumber(body, "Max Patterns Drawn", sec.maxPatterns, 1, 5, 1, (v) => (sec.maxPatterns = v));
      }

      const rst = document.createElement("button");
      rst.className = "reset-tab-btn";
      rst.textContent = "Reset This Indicator to Defaults";
      rst.addEventListener("click", () => {
        TV.ConfigStore.resetSection(key);
        this.actions.recompute();
        this.renderSettingsBody();
      });
      body.appendChild(rst);
    }
  }

  TV.UIController = UIController;
})(window.TVChart);
