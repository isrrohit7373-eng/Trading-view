window.TVChart = window.TVChart || {};

(function (TV) {
  const REST_BASES = [
    "https://data-api.binance.vision",
    "https://api.binance.com",
    "https://api1.binance.com",
    "https://api3.binance.com"
  ];

  const WS_BASES = [
    "wss://stream.binance.com:9443/stream?streams=",
    "wss://data-stream.binance.vision/stream?streams="
  ];

  const TF_MS = {
    "1m": 60000,
    "3m": 180000,
    "5m": 300000,
    "15m": 900000,
    "30m": 1800000,
    "1h": 3600000,
    "4h": 14400000
  };

  function parseKline(k) {
    const o = parseFloat(k[1]);
    const h = parseFloat(k[2]);
    const l = parseFloat(k[3]);
    const c = parseFloat(k[4]);
    const v = parseFloat(k[5]);
    const takerBuy = parseFloat(k[9]) || 0;
    const takerSell = Math.max(0, v - takerBuy);
    const ratio = h === l ? (c >= o ? 0.6 : 0.4) : (c - l) / (h - l);
    const tickBuy = v * Math.max(0.05, Math.min(0.95, ratio));
    const tickSell = Math.max(0, v - tickBuy);
    return {
      time: Number(k[0]),
      closeTime: Number(k[6]),
      open: o,
      high: h,
      low: l,
      close: c,
      volume: v,
      takerBuy,
      takerSell,
      tickBuy,
      tickSell,
      liveAggActive: false
    };
  }

  class DataEngine {
    constructor(callbacks) {
      this.cb = callbacks || {};
      this.candles = [];
      this.symbol = "BTCUSDT";
      this.timeframe = "1m";
      this.ws = null;
      this.wsIndex = 0;
      this.reconnectTimer = null;
      this.loadingMore = false;
      this.lastTickPrice = null;
      this.destroyed = false;
    }

    getIntervalMs() {
      return TF_MS[this.timeframe] || 60000;
    }

    async fetchWithFallback(path) {
      let lastErr = null;
      for (let i = 0; i < REST_BASES.length; i++) {
        const url = REST_BASES[i] + path;
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 8000);
          const res = await fetch(url, { signal: ctrl.signal });
          clearTimeout(timer);
          if (res.ok) return await res.json();
          lastErr = new Error("HTTP " + res.status);
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr || new Error("All Binance REST endpoints failed");
    }

    async loadSymbol(symbol, timeframe) {
      this.symbol = symbol;
      this.timeframe = timeframe;
      this.closeWs();
      this.lastTickPrice = null;

      if (this.cb.onStatus) this.cb.onStatus("loading", `Loading ${symbol} ${timeframe}…`);

      try {
        const raw = await this.fetchWithFallback(
          `/api/v3/klines?symbol=${symbol}&interval=${timeframe}&limit=500`
        );
        this.candles = raw.map(parseKline);
        if (this.cb.onData) this.cb.onData(this.candles, true);
        if (this.cb.onStatus) this.cb.onStatus("live", "");
        this.connectWs();
      } catch (err) {
        if (this.cb.onStatus) this.cb.onStatus("err", "Connection error — retrying…");
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => this.loadSymbol(symbol, timeframe), 3500);
      }
    }

    async loadOlder() {
      if (this.loadingMore || !this.candles.length) return 0;
      this.loadingMore = true;
      try {
        const firstTime = this.candles[0].time;
        const raw = await this.fetchWithFallback(
          `/api/v3/klines?symbol=${this.symbol}&interval=${this.timeframe}&endTime=${firstTime - 1}&limit=250`
        );
        const older = raw.map(parseKline).filter((c) => c.time < firstTime);
        if (older.length) {
          this.candles = older.concat(this.candles);
          if (this.cb.onOlderData) this.cb.onOlderData(older.length);
        }
        return older.length;
      } catch (e) {
        return 0;
      } finally {
        this.loadingMore = false;
      }
    }

    closeWs() {
      clearTimeout(this.reconnectTimer);
      if (this.ws) {
        try {
          this.ws.onopen = null;
          this.ws.onmessage = null;
          this.ws.onerror = null;
          this.ws.onclose = null;
          this.ws.close();
        } catch (e) {}
        this.ws = null;
      }
    }

    connectWs() {
      this.closeWs();
      const symLower = this.symbol.toLowerCase();
      const streams = `${symLower}@kline_${this.timeframe}/${symLower}@aggTrade`;
      const url = WS_BASES[this.wsIndex % WS_BASES.length] + streams;

      try {
        const ws = new WebSocket(url);
        this.ws = ws;

        ws.onopen = () => {
          if (this.cb.onStatus) this.cb.onStatus("live", "");
        };

        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            if (!msg || !msg.data) return;
            const d = msg.data;
            if (d.e === "kline") this.handleKline(d.k);
            else if (d.e === "aggTrade") this.handleAggTrade(d);
          } catch (e) {}
        };

        ws.onerror = () => {
          this.wsIndex++;
        };

        ws.onclose = () => {
          if (this.destroyed) return;
          if (this.cb.onStatus) this.cb.onStatus("loading", "");
          this.wsIndex++;
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = setTimeout(() => this.connectWs(), 2500);
        };
      } catch (e) {
        this.wsIndex++;
        this.reconnectTimer = setTimeout(() => this.connectWs(), 3000);
      }
    }

    handleKline(k) {
      if (!this.candles.length) return;
      const openTime = Number(k.t);
      const last = this.candles[this.candles.length - 1];
      const o = parseFloat(k.o);
      const h = parseFloat(k.h);
      const l = parseFloat(k.l);
      const c = parseFloat(k.c);
      const v = parseFloat(k.v);
      const takerBuy = parseFloat(k.V) || 0;
      const takerSell = Math.max(0, v - takerBuy);

      if (openTime === last.time) {
        last.open = o;
        last.high = h;
        last.low = l;
        last.close = c;
        last.volume = v;
        last.closeTime = Number(k.T);
        last.takerBuy = takerBuy;
        last.takerSell = takerSell;
        if (!last.liveAggActive) {
          last.tickBuy = takerBuy;
          last.tickSell = takerSell;
        }
      } else if (openTime > last.time) {
        this.candles.push({
          time: openTime,
          closeTime: Number(k.T),
          open: o,
          high: h,
          low: l,
          close: c,
          volume: v,
          takerBuy,
          takerSell,
          tickBuy: takerBuy,
          tickSell: takerSell,
          liveAggActive: false
        });
        if (this.candles.length > 1500) this.candles.shift();
      }
      if (this.cb.onTick) this.cb.onTick(this.candles);
    }

    handleAggTrade(t) {
      if (!this.candles.length) return;
      const last = this.candles[this.candles.length - 1];
      const price = parseFloat(t.p);
      const qty = parseFloat(t.q);
      if (!isFinite(price) || !isFinite(qty)) return;

      if (!last.liveAggActive) {
        last.liveAggActive = true;
      }

      if (this.lastTickPrice === null) {
        if (t.m) last.tickSell += qty;
        else last.tickBuy += qty;
      } else if (price > this.lastTickPrice) {
        last.tickBuy += qty;
      } else if (price < this.lastTickPrice) {
        last.tickSell += qty;
      } else {
        if (t.m) last.tickSell += qty;
        else last.tickBuy += qty;
      }
      this.lastTickPrice = price;
    }
  }

  TV.DataEngine = DataEngine;
})(window.TVChart);
