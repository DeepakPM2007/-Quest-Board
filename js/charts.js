// Clean, readable canvas charts with axes, ticks, subtle grid, and high-contrast colors.

const Charts = (() => {
  function clear(ctx) {
    const { width, height } = ctx.canvas;
    ctx.clearRect(0, 0, width, height);
  }

  function drawGrid(ctx, pad, gridColor) {
    const { width, height } = ctx.canvas;
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const y = pad + (i * (height - pad * 2)) / steps;
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(width - pad, y);
      ctx.stroke();
    }
    // Axes
    ctx.beginPath();
    ctx.moveTo(pad, height - pad);
    ctx.lineTo(width - pad, height - pad);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pad, pad);
    ctx.lineTo(pad, height - pad);
    ctx.stroke();
  }

  function niceRange(min, max) {
    if (min === max) {
      return { min: 0, max: max || 1, step: 1 };
    }
    const range = max - min;
    const step = Math.max(1, Math.round(range / 4));
    const nmin = Math.floor(min / step) * step;
    const nmax = Math.ceil(max / step) * step;
    return { min: nmin, max: nmax, step };
  }

  function scaleY(value, min, max, height, pad) {
    return (
      height - pad - ((value - min) / (max - min || 1)) * (height - pad * 2)
    );
  }

  function drawYAxisLabels(ctx, pad, min, max, step, labelColor) {
    const { height } = ctx.canvas;
    ctx.fillStyle = labelColor;
    ctx.font = "12px system-ui";
    for (let v = min; v <= max; v += step) {
      const y = scaleY(v, min, max, height, pad);
      ctx.fillText(String(v), 6, y + 4);
    }
  }

  function drawXAxisDates(ctx, pad, dates, labelColor) {
    const { width, height } = ctx.canvas;
    ctx.fillStyle = labelColor;
    ctx.font = "12px system-ui";
    const n = dates.length;
    const step = Math.max(1, Math.floor(n / 6));
    for (let i = 0; i < n; i += step) {
      const x = pad + (i * (width - pad * 2)) / (n - 1 || 1);
      const d = dates[i]?.slice(5); // "MM-DD"
      ctx.fillText(d || "", x - 16, height - 6);
    }
  }

  function lineChart(ctx, data, dates, opts = {}) {
    const pad = opts.pad ?? 36;
    const color = opts.color ?? "#59f0ff";
    const point = opts.point ?? 2.5;
    const gridColor = opts.gridColor ?? "rgba(255,255,255,0.08)";
    const labelColor = opts.labelColor ?? "rgba(255,255,255,0.6)";

    clear(ctx);
    const minVal = Math.min(...data, 0);
    const maxVal = Math.max(...data, 1);
    const { min, max, step } = niceRange(minVal, maxVal);

    drawGrid(ctx, pad, gridColor);
    drawYAxisLabels(ctx, pad, min, max, step, labelColor);
    drawXAxisDates(ctx, pad, dates, labelColor);

    // Path
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    data.forEach((val, i) => {
      const x =
        pad + (i * (ctx.canvas.width - pad * 2)) / (data.length - 1 || 1);
      const y = scaleY(val, min, max, ctx.canvas.height, pad);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Points
    ctx.fillStyle = color;
    data.forEach((val, i) => {
      const x =
        pad + (i * (ctx.canvas.width - pad * 2)) / (data.length - 1 || 1);
      const y = scaleY(val, min, max, ctx.canvas.height, pad);
      ctx.beginPath();
      ctx.arc(x, y, point, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function barDual(ctx, seriesA, seriesB, dates, opts = {}) {
    const pad = opts.pad ?? 36;
    const colorA = opts.colorA ?? "#6cf09a";
    const colorB = opts.colorB ?? "#ffb36b";
    const gridColor = opts.gridColor ?? "rgba(255,255,255,0.08)";
    const labelColor = opts.labelColor ?? "rgba(255,255,255,0.6)";

    clear(ctx);
    const maxVal = Math.max(Math.max(...seriesA, 0), Math.max(...seriesB, 0));
    const { min, max, step } = niceRange(0, maxVal);

    drawGrid(ctx, pad, gridColor);
    drawYAxisLabels(ctx, pad, min, max, step, labelColor);
    drawXAxisDates(ctx, pad, dates, labelColor);

    const n = Math.max(seriesA.length, seriesB.length);
    const slot = (ctx.canvas.width - pad * 2) / (n || 1);
    const barW = slot * 0.36;

    for (let i = 0; i < n; i++) {
      const x = pad + i * slot;
      const a = seriesA[i] || 0;
      const b = seriesB[i] || 0;

      const yA = scaleY(a, min, max, ctx.canvas.height, pad);
      const hA = ctx.canvas.height - pad - yA;
      ctx.fillStyle = colorA;
      roundRect(ctx, x - barW, yA, barW, hA, 4);

      const yB = scaleY(b, min, max, ctx.canvas.height, pad);
      const hB = ctx.canvas.height - pad - yB;
      ctx.fillStyle = colorB;
      roundRect(ctx, x + 4, yB, barW, hB, 4);
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  return { lineChart, barDual };
})();
