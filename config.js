window.TVChart = window.TVChart || {};

(function (TV) {
  const STORAGE_KEY = "tv_pro_chart_v8";

  const SYMBOLS = [
    { id: "BTCUSDT", label: "Bitcoin / U.S. Dollar", short: "BTCUSDT", base: "BTC", icon: "₿", color: "#f7931a", decimals: 1 },
    { id: "ETHUSDT", label: "Ethereum / U.S. Dollar", short: "ETHUSDT", base: "ETH", icon: "Ξ", color: "#627eea", decimals: 2 },
    { id: "SOLUSDT", label: "Solana / U.S. Dollar", short: "SOLUSDT", base: "SOL", icon: "◎", color: "#14f195", decimals: 2 },
    { id: "BNBUSDT", label: "BNB / U.S. Dollar", short: "BNBUSDT", base: "BNB", icon: "◆", color: "#f3ba2f", decimals: 2 }
  ];

  const TIMEFRAMES = ["1m", "3m", "5m", "15m", "30m", "1h", "4h"];

  function getDefaults() {
    return {
      symbol: "BTCUSDT",
      timeframe: "1m",
      cleanMode: false,
      showHiLoLines: true,
      btcFlow: {
        enabled: true,
        mode: "TAKER", // TAKER | TICK
        showLabels: true,
        showSplitVol: true,
        minVol: 0,
        minDomPct: 50,
        decimals: 2,
        fontSize: 9,
        buyColor: "#089981",
        sellColor: "#f23645"
      },
      absCvd: {
        enabled: true,
        showMarkers: true,
        showHalo: true,
        showSubPane: true,
        volMult: 1.4,
        smaLen: 20,
        minDeltaPct: 12,
        rsiFilter: true,
        rsiOb: 65,
        rsiOs: 35,
        wickRatio: 0.35,
        cvdColor: "#2962ff",
        bullColor: "#00e676",
        bearColor: "#ff1744"
      },
      rsi: {
        enabled: true,
        period: 14,
        maPeriod: 14,
        showMa: true,
        ob: 70,
        os: 30,
        lineColor: "#ab47bc",
        maColor: "#ffb74d"
      },
      vwapEma: {
        enabled: true,
        showVwap: true,
        showBands: false,
        showEmaFast: true,
        showEmaSlow: true,
        emaFast: 20,
        emaSlow: 50,
        vwapColor: "#ffb300",
        fastColor: "#29b6f6",
        slowColor: "#ef5350"
      },
      srLevels: {
        enabled: true,
        pivotLen: 6,
        maxZones: 4,
        zonePct: 0.12,
        showLabels: true,
        supColor: "#089981",
        resColor: "#f23645"
      },
      macd: {
        enabled: false,
        fast: 12,
        slow: 26,
        signal: 9,
        macdColor: "#2962ff",
        sigColor: "#ff9800"
      },
      structure: {
        enabled: true,
        swingLen: 4,
        showSwings: true,
        showBos: true,
        bullColor: "#26a69a",
        bearColor: "#ef5350"
      },
      smcPro: {
        enabled: true,
        swingLen: 4,
        showChoch: true,
        showLiq: true,
        showSweeps: true,
        showOb: true,
        showEntries: true,
        eqTolPct: 0.05,
        maxLiq: 4,
        maxOb: 3
      },
      patterns: {
        enabled: true,
        swingLen: 3,
        showWM: true,
        showTriangles: true,
        showHS: true,
        showTargets: true,
        maxPatterns: 3
      }
    };
  }

  function deepMerge(target, source) {
    if (!source || typeof source !== "object") return target;
    const out = Array.isArray(target) ? target.slice() : Object.assign({}, target);
    Object.keys(source).forEach((k) => {
      if (k in target) {
        if (target[k] && typeof target[k] === "object" && !Array.isArray(target[k])) {
          out[k] = deepMerge(target[k], source[k]);
        } else if (typeof source[k] === typeof target[k]) {
          out[k] = source[k];
        }
      }
    });
    return out;
  }

  const ConfigStore = {
    SYMBOLS,
    TIMEFRAMES,
    data: getDefaults(),
    listeners: [],

    load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          this.data = deepMerge(getDefaults(), JSON.parse(raw));
        } else {
          this.data = getDefaults();
        }
      } catch (e) {
        this.data = getDefaults();
      }
      return this.data;
    },

    save() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      } catch (e) {
        // Ignore private browsing quota errors
      }
      this.notify();
    },

    resetSection(sectionKey) {
      const def = getDefaults();
      if (sectionKey && sectionKey in def) {
        this.data[sectionKey] = JSON.parse(JSON.stringify(def[sectionKey]));
      } else {
        this.data = def;
      }
      this.save();
    },

    getSymbolMeta(symId) {
      return SYMBOLS.find((s) => s.id === (symId || this.data.symbol)) || SYMBOLS[0];
    },

    subscribe(fn) {
      this.listeners.push(fn);
    },

    notify() {
      this.listeners.forEach((fn) => {
        try { fn(this.data); } catch (e) {}
      });
    }
  };

  TV.ConfigStore = ConfigStore;
})(window.TVChart);
