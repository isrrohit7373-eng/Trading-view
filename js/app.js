window.TVChart = window.TVChart || {};

(function (TV) {
  function initApp() {
    TV.ConfigStore.load();
    const cfg = TV.ConfigStore.data;

    const state = {
      candles: [],
      indicators: {},
      view: {
        spacing: 11,
        rightOffset: 6,
        autoFit: true,
        minPrice: 0,
        maxPrice: 1
      },
      crosshair: {
        active: false,
        locked: false,
        idx: 0,
        y: 0
      },
      needsRender: true
    };

    const canvas = document.getElementById("chartCanvas");
    const renderer = new TV.CanvasRenderer(canvas, state);

    let lastComputeMs = 0;
    function recomputeIndicators(force) {
      const now = Date.now();
      if (!force && now - lastComputeMs < 180) return;
      lastComputeMs = now;
      state.indicators = TV.IndicatorEngine.computeAll(state.candles, TV.ConfigStore.data);
      state.needsRender = true;
      ui.updateHUD();
    }

    const actions = {
      recompute: () => recomputeIndicators(true),
      loadSymbol: (sym, tf) => {
        state.view.rightOffset = 6;
        state.view.autoFit = true;
        ui.setAutoFitUI(true);
        dataEngine.loadSymbol(sym, tf);
      },
      setAutoFit: (val) => {
        state.view.autoFit = val;
        ui.setAutoFitUI(val);
        state.needsRender = true;
      },
      resetView: () => {
        state.view.spacing = 11;
        state.view.rightOffset = 6;
        state.view.autoFit = true;
        ui.setAutoFitUI(true);
        state.needsRender = true;
      },
      jumpLatest: () => {
        state.view.rightOffset = 6;
        state.needsRender = true;
      }
    };

    const ui = new TV.UIController(state, actions);

    const dataEngine = new TV.DataEngine({
      onStatus: (s, msg) => ui.setStatus(s, msg),
      onData: (candles) => {
        state.candles = candles;
        recomputeIndicators(true);
      },
      onOlderData: () => {
        recomputeIndicators(true);
      },
      onTick: (candles) => {
        state.candles = candles;
        recomputeIndicators(false);
        state.needsRender = true;
      }
    });

    const touch = new TV.TouchController(canvas, renderer, state, {
      onAutoFitChange: (val) => ui.setAutoFitUI(val),
      onToggleAutoFit: (val) => actions.setAutoFit(val),
      onResetZoom: () => actions.resetView(),
      onCrosshairChange: () => ui.updateHUD(),
      onNeedOlder: () => dataEngine.loadOlder()
    });

    // Main 60fps loop (also ticks countdown timer once per second)
    let lastSec = 0;
    function frame() {
      touch.stepInertia();
      const sec = Math.floor(Date.now() / 1000);
      if (sec !== lastSec) {
        lastSec = sec;
        state.needsRender = true;
      }
      if (state.needsRender) {
        state.needsRender = false;
        renderer.render();
      }
      requestAnimationFrame(frame);
    }

    dataEngine.loadSymbol(cfg.symbol, cfg.timeframe);
    requestAnimationFrame(frame);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
  } else {
    initApp();
  }
})(window.TVChart);
