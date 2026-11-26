window.TVChart = window.TVChart || {};

(function (TV) {
  class TouchController {
    constructor(canvas, renderer, state, callbacks) {
      this.canvas = canvas;
      this.renderer = renderer;
      this.state = state;
      this.cb = callbacks || {};

      this.mode = null; // pan | yscale | xscale | pinch | crosshair
      this.startX = 0;
      this.startY = 0;
      this.lastX = 0;
      this.lastY = 0;
      this.vx = 0;
      this.vy = 0;
      this.lastMoveTime = 0;
      this.longPressTimer = null;
      this.lastTapTime = 0;
      this.lastTapZone = null;

      // Pinch state
      this.pinchDistX = 0;
      this.pinchDistY = 0;
      this.pinchStartSpacing = 10;
      this.pinchStartMinP = 0;
      this.pinchStartMaxP = 0;
      this.pinchAnchorIdx = 0;
      this.pinchMidX = 0;

      // Mouse drag
      this.mouseDown = false;

      this.bindEvents();
    }

    getZone(x, y) {
      const { plotW, totalH } = this.renderer.layout;
      if (x >= plotW && y <= totalH) return "yaxis";
      if (y > totalH) return "xaxis";
      return "plot";
    }

    bindEvents() {
      const c = this.canvas;
      c.addEventListener("touchstart", (e) => this.onTouchStart(e), { passive: false });
      c.addEventListener("touchmove", (e) => this.onTouchMove(e), { passive: false });
      c.addEventListener("touchend", (e) => this.onTouchEnd(e), { passive: false });
      c.addEventListener("touchcancel", (e) => this.onTouchEnd(e), { passive: false });

      // Desktop mouse support
      c.addEventListener("mousedown", (e) => this.onMouseDown(e));
      window.addEventListener("mousemove", (e) => this.onMouseMove(e));
      window.addEventListener("mouseup", () => this.onMouseUp());
      c.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
      c.addEventListener("dblclick", (e) => this.onDblClick(e));
    }

    localPos(clientX, clientY) {
      const rect = this.canvas.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    }

    stopInertia() {
      this.vx = 0;
      this.vy = 0;
    }

    onTouchStart(e) {
      e.preventDefault();
      this.stopInertia();
      clearTimeout(this.longPressTimer);

      const touches = e.touches;
      if (touches.length === 2) {
        const p1 = this.localPos(touches[0].clientX, touches[0].clientY);
        const p2 = this.localPos(touches[1].clientX, touches[1].clientY);
        this.mode = "pinch";
        this.pinchDistX = Math.max(18, Math.abs(p2.x - p1.x));
        this.pinchDistY = Math.max(18, Math.abs(p2.y - p1.y));
        this.pinchStartSpacing = this.state.view.spacing;
        this.pinchStartMinP = this.state.view.minPrice;
        this.pinchStartMaxP = this.state.view.maxPrice;
        this.pinchMidX = (p1.x + p2.x) / 2;
        this.pinchAnchorIdx = this.renderer.xToIdx(this.pinchMidX);
        return;
      }

      if (touches.length === 1) {
        const p = this.localPos(touches[0].clientX, touches[0].clientY);
        const zone = this.getZone(p.x, p.y);
        const now = Date.now();

        // Double tap detection on axes
        if (now - this.lastTapTime < 300 && this.lastTapZone === zone) {
          this.lastTapTime = 0;
          if (zone === "yaxis" && this.cb.onToggleAutoFit) this.cb.onToggleAutoFit(true);
          else if (zone === "xaxis" && this.cb.onResetZoom) this.cb.onResetZoom();
          return;
        }
        this.lastTapTime = now;
        this.lastTapZone = zone;

        this.startX = this.lastX = p.x;
        this.startY = this.lastY = p.y;
        this.lastMoveTime = now;

        if (this.state.crosshair.locked && zone === "plot") {
          this.mode = "crosshair";
          this.updateCrosshair(p.x, p.y);
          return;
        }

        if (zone === "yaxis") {
          this.mode = "yscale";
        } else if (zone === "xaxis") {
          this.mode = "xscale";
        } else {
          this.mode = "pan";
          // 300ms long press activates TradingView crosshair
          this.longPressTimer = setTimeout(() => {
            if (this.mode === "pan" && Math.hypot(this.lastX - this.startX, this.lastY - this.startY) < 8) {
              this.mode = "crosshair";
              this.state.crosshair.active = true;
              this.updateCrosshair(this.lastX, this.lastY);
              if (navigator.vibrate) try { navigator.vibrate(15); } catch (err) {}
            }
          }, 300);
        }
      }
    }

    onTouchMove(e) {
      e.preventDefault();
      const touches = e.touches;

      if (this.mode === "pinch" && touches.length === 2) {
        const p1 = this.localPos(touches[0].clientX, touches[0].clientY);
        const p2 = this.localPos(touches[1].clientX, touches[1].clientY);
        const dx = Math.max(18, Math.abs(p2.x - p1.x));
        const dy = Math.max(18, Math.abs(p2.y - p1.y));
        const midX = (p1.x + p2.x) / 2;

        // Horizontal X-axis candle zoom (pinch in / pinch out)
        const scaleX = dx / this.pinchDistX;
        const newSpacing = Math.max(2.5, Math.min(44, this.pinchStartSpacing * scaleX));
        const plotW = this.renderer.layout.plotW;
        const n = this.state.candles.length;
        this.state.view.spacing = newSpacing;
        this.state.view.rightOffset =
          this.pinchAnchorIdx - (n - 1) + (plotW - midX - newSpacing * 0.5) / newSpacing;

        // Vertical Y-axis candle zoom if vertical pinch movement is significant
        const ratioY = dy / this.pinchDistY;
        if (Math.abs(ratioY - 1) > 0.14) {
          this.state.view.autoFit = false;
          const midP = (this.pinchStartMinP + this.pinchStartMaxP) / 2;
          const halfSpan = ((this.pinchStartMaxP - this.pinchStartMinP) / 2) / Math.max(0.25, Math.min(4, ratioY));
          this.state.view.minPrice = midP - halfSpan;
          this.state.view.maxPrice = midP + halfSpan;
          if (this.cb.onAutoFitChange) this.cb.onAutoFitChange(false);
        }

        this.state.needsRender = true;
        this.checkLazyLoad();
        return;
      }

      if (touches.length !== 1) return;
      const p = this.localPos(touches[0].clientX, touches[0].clientY);
      const dx = p.x - this.lastX;
      const dy = p.y - this.lastY;
      const now = Date.now();
      const dt = Math.max(8, now - this.lastMoveTime);

      if (Math.hypot(p.x - this.startX, p.y - this.startY) > 6) {
        clearTimeout(this.longPressTimer);
      }

      if (this.mode === "crosshair") {
        this.updateCrosshair(p.x, p.y);
      } else if (this.mode === "pan") {
        this.panBy(dx, dy);
        this.vx = dx / dt;
        this.vy = dy / dt;
      } else if (this.mode === "yscale") {
        this.scaleY(dy);
      } else if (this.mode === "xscale") {
        this.scaleX(dx);
      }

      this.lastX = p.x;
      this.lastY = p.y;
      this.lastMoveTime = now;
    }

    onTouchEnd(e) {
      clearTimeout(this.longPressTimer);
      if (e.touches.length === 0) {
        if (this.mode === "crosshair" && !this.state.crosshair.locked) {
          this.state.crosshair.active = false;
          this.state.needsRender = true;
          if (this.cb.onCrosshairChange) this.cb.onCrosshairChange(null);
        }
        if (this.mode !== "pan") {
          this.vx = 0;
          this.vy = 0;
        }
        this.mode = null;
      }
    }

    onMouseDown(e) {
      const p = this.localPos(e.clientX, e.clientY);
      const zone = this.getZone(p.x, p.y);
      this.mouseDown = true;
      this.stopInertia();
      this.startX = this.lastX = p.x;
      this.startY = this.lastY = p.y;
      if (zone === "yaxis") this.mode = "yscale";
      else if (zone === "xaxis") this.mode = "xscale";
      else if (this.state.crosshair.locked) {
        this.mode = "crosshair";
        this.updateCrosshair(p.x, p.y);
      } else this.mode = "pan";
    }

    onMouseMove(e) {
      const p = this.localPos(e.clientX, e.clientY);
      if (!this.mouseDown) {
        if (this.state.crosshair.locked) this.updateCrosshair(p.x, p.y);
        return;
      }
      const dx = p.x - this.lastX;
      const dy = p.y - this.lastY;
      if (this.mode === "pan") this.panBy(dx, dy);
      else if (this.mode === "yscale") this.scaleY(dy);
      else if (this.mode === "xscale") this.scaleX(dx);
      else if (this.mode === "crosshair") this.updateCrosshair(p.x, p.y);
      this.lastX = p.x;
      this.lastY = p.y;
    }

    onMouseUp() {
      this.mouseDown = false;
      this.mode = null;
    }

    onWheel(e) {
      e.preventDefault();
      const p = this.localPos(e.clientX, e.clientY);
      const factor = e.deltaY < 0 ? 1.12 : 0.89;
      const anchorIdx = this.renderer.xToIdx(p.x);
      const newSpacing = Math.max(2.5, Math.min(44, this.state.view.spacing * factor));
      const plotW = this.renderer.layout.plotW;
      const n = this.state.candles.length;
      this.state.view.spacing = newSpacing;
      this.state.view.rightOffset =
        anchorIdx - (n - 1) + (plotW - p.x - newSpacing * 0.5) / newSpacing;
      this.state.needsRender = true;
      this.checkLazyLoad();
    }

    onDblClick(e) {
      const p = this.localPos(e.clientX, e.clientY);
      const zone = this.getZone(p.x, p.y);
      if (zone === "yaxis" && this.cb.onToggleAutoFit) this.cb.onToggleAutoFit(true);
      else if (zone === "xaxis" && this.cb.onResetZoom) this.cb.onResetZoom();
    }

    panBy(dx, dy) {
      const v = this.state.view;
      v.rightOffset -= dx / v.spacing;
      // Clamp rightOffset so user doesn't lose chart entirely
      const maxRight = 40;
      const minRight = -this.state.candles.length + 6;
      v.rightOffset = Math.max(minRight, Math.min(maxRight, v.rightOffset));

      if (!v.autoFit && Math.abs(dy) > 0) {
        const span = v.maxPrice - v.minPrice;
        const usableH = Math.max(40, this.renderer.layout.main.height - 60);
        const deltaP = (dy / usableH) * span;
        v.minPrice += deltaP;
        v.maxPrice += deltaP;
      }

      this.state.needsRender = true;
      this.checkLazyLoad();
    }

    scaleY(dy) {
      const v = this.state.view;
      v.autoFit = false;
      const factor = Math.exp(dy * 0.008);
      const mid = (v.minPrice + v.maxPrice) / 2;
      const half = Math.max(1e-6, ((v.maxPrice - v.minPrice) / 2) * factor);
      v.minPrice = mid - half;
      v.maxPrice = mid + half;
      if (this.cb.onAutoFitChange) this.cb.onAutoFitChange(false);
      this.state.needsRender = true;
    }

    scaleX(dx) {
      const v = this.state.view;
      const factor = Math.exp(-dx * 0.008);
      v.spacing = Math.max(2.5, Math.min(44, v.spacing * factor));
      this.state.needsRender = true;
      this.checkLazyLoad();
    }

    updateCrosshair(x, y) {
      const idx = Math.max(0, Math.min(this.state.candles.length - 1, this.renderer.xToIdx(x)));
      this.state.crosshair.active = true;
      this.state.crosshair.idx = idx;
      this.state.crosshair.y = y;
      this.state.needsRender = true;
      if (this.cb.onCrosshairChange) this.cb.onCrosshairChange(idx);
    }

    stepInertia() {
      if (this.mode !== null) return;
      if (Math.abs(this.vx) < 0.015 && Math.abs(this.vy) < 0.015) {
        this.vx = 0; this.vy = 0;
        return;
      }
      this.panBy(this.vx * 16, this.vy * 16);
      this.vx *= 0.91;
      this.vy *= 0.91;
    }

    checkLazyLoad() {
      const leftIdx = this.renderer.xToIdx(0);
      if (leftIdx < 25 && this.cb.onNeedOlder) {
        this.cb.onNeedOlder();
      }
    }
  }

  TV.TouchController = TouchController;
})(window.TVChart);
