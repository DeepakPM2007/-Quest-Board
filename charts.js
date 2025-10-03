// Lightweight canvas chart utilities (no external libs)

const Charts = (() => {
  function scale(value, min, max, height, pad = 20) {
    if (max === min) return height - pad;
    return height - pad - ((value - min) / (max - min)) * (height - pad * 2);
  }

  function lineChart(ctx, data, opts = {}) {
    const { width, height } = ctx.canvas;
    const pad = opts.pad ?? 24;
    const color = opts.color ?? "#59f0ff";
    const fill = opts.fill ?? "rgba(89,240,255,0.12)";
    const grid = opts.grid ?? true;

    const min = Math.min(...data);
    const max = Math.max(...data);

    ctx.clearRect(0, 0, width, height);

    // Grid
    if (grid) {
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const y = pad + (i * (height - pad * 2)) / 4;
        ctx.beginPath();
        ctx.moveTo(pad, y);
        ctx.lineTo(width - pad, y);
        ctx.stroke();
      }
    }

    // Line path
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = pad + (i * (width - pad * 2)) / (data.length - 1 || 1);
      const y = scale(data[i], min, max, height, pad);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Fill under line
    ctx.fillStyle = fill;
    ctx.lineTo(width - pad, height - pad);
    ctx.lineTo(pad, height - pad);
    ctx.closePath();
    ctx.fill();

    // Points
    ctx.fillStyle = color;
    for (let i = 0; i < data.length; i++) {
      const x = pad + (i * (width - pad * 2)) / (data.length - 1 || 1);
      const y = scale(data[i], min, max, height, pad);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function dualBars(ctx, seriesA, seriesB, opts = {}) {
    const { width, height } = ctx.canvas;
    const pad = opts.pad ?? 24;
    const colorA = opts.colorA ?? "#c48dff";
    const colorB = opts.colorB ?? "#ffb36b";

    const max = Math.max(Math.max(...seriesA), Math.max(...seriesB));
    ctx.clearRect(0, 0, width, height);

    // Axis
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.beginPath();
    ctx.moveTo(pad, height - pad);
    ctx.lineTo(width - pad, height - pad);
    ctx.stroke();

    const n = Math.max(seriesA.length, seriesB.length);
    const slot = (width - pad * 2) / n;
    const barWidth = slot * 0.36;

    for (let i = 0; i < n; i++) {
      const x = pad + i * slot;

      // A
      const hA = ((seriesA[i] || 0) / (max || 1)) * (height - pad * 2);
      ctx.fillStyle = colorA;
      ctx.fillRect(x - barWidth, height - pad - hA, barWidth, hA);

      // B
      const hB = ((seriesB[i] || 0) / (max || 1)) * (height - pad * 2);
      ctx.fillStyle = colorB;
      ctx.fillRect(x + 4, height - pad - hB, barWidth, hB);
    }
  }

  return { lineChart, dualBars };
})();