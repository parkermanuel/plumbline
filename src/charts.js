// SVG charts. All colors from CSS tokens.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Spiritual gifts fan: rays from a hub on the left, sorted strongest at top.
export function giftFan(list, { title = "Spiritual gifts" } = {}) {
  const n = list.length;
  if (!n) return "";
  const R = 250, r0 = 20, cx = 24, cy = R + 120, H = cy * 2, W = cx + R + 170;
  const a0 = -82, a1 = 82;
  const rays = list.map((g, i) => {
    const ang = ((a0 + ((a1 - a0) * i) / Math.max(1, n - 1)) * Math.PI) / 180;
    const len = r0 + (Math.max(4, g.pct) / 100) * (R - r0);
    const x1 = cx + Math.cos(ang) * r0, y1 = cy + Math.sin(ang) * r0;
    const x2 = cx + Math.cos(ang) * len, y2 = cy + Math.sin(ang) * len;
    const lx = cx + Math.cos(ang) * (R + 16), ly = cy + Math.sin(ang) * (R + 16);
    const tier = i < 5 ? 1 : i < 10 ? 0.55 : 0.28;
    const color = i < 5 ? "var(--brass)" : "var(--ink-3)";
    const deg = (ang * 180) / Math.PI;
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-opacity="${tier}" stroke-width="13" stroke-linecap="round"><title>${esc(g.name)}: ${g.pct}</title></line>
      <text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" transform="rotate(${deg.toFixed(1)} ${lx.toFixed(1)} ${ly.toFixed(1)})" dominant-baseline="middle" font-size="13" font-weight="${i < 5 ? 700 : 500}" style="fill:${i < 5 ? "var(--ink)" : "var(--ink-3)"}">${esc(g.name)}</text>`;
  }).join("");
  const guide = [0.5, 1].map((f) => `<circle cx="${cx}" cy="${cy}" r="${r0 + f * (R - r0)}" fill="none" stroke="var(--rule)" stroke-dasharray="2 5"/>`).join("");
  return `<svg class="viz" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${guide}${rays}<circle cx="${cx}" cy="${cy}" r="7" fill="var(--ink)"/></svg>`;
}

// Radar with up to two overlaid polygons. axes: [{label}], series: [{values:[0..1], color, label}]
export function radar(axes, series, { size = 420, rings = 4 } = {}) {
  const n = axes.length, pad = 70, cx = size / 2 + pad, cy = size / 2 + 6, R = size / 2 - 60;
  const pt = (i, v) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return [cx + Math.cos(a) * R * v, cy + Math.sin(a) * R * v];
  };
  let g = "";
  for (let k = 1; k <= rings; k++) {
    const ps = axes.map((_, i) => pt(i, k / rings).map((x) => x.toFixed(1)).join(",")).join(" ");
    g += `<polygon points="${ps}" fill="none" stroke="var(--rule)"/>`;
  }
  axes.forEach((ax, i) => {
    const [x, y] = pt(i, 1);
    const [lx, ly] = pt(i, 1.2);
    const anchor = Math.abs(lx - cx) < 8 ? "middle" : lx > cx ? "start" : "end";
    g += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--rule)"/>`;
    g += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="middle" font-size="13" font-weight="600">${esc(ax.label)}</text>`;
  });
  series.forEach((s) => {
    const ps = s.values.map((v, i) => pt(i, Math.max(0.02, v ?? 0)).map((x) => x.toFixed(1)).join(",")).join(" ");
    g += `<polygon points="${ps}" fill="${s.color}" fill-opacity=".14" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round"/>`;
    s.values.forEach((v, i) => { const [x, y] = pt(i, Math.max(0.02, v ?? 0)); g += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${s.color}"/>`; });
  });
  return `<svg class="viz" viewBox="0 0 ${size + pad * 2} ${size + 12}" role="img" aria-label="${esc(series.map((s) => s.label).join(" and "))}">${g}</svg>`;
}

// The Plumbline mark: a line with a brass bob.
export function mark(h = 30) {
  return `<svg width="${h * 0.62}" height="${h}" viewBox="0 0 20 32" aria-hidden="true"><line x1="10" y1="0" x2="10" y2="15" stroke="var(--ink)" stroke-width="2"/><path d="M10 14 L16 21 L10 32 L4 21 Z" fill="var(--brass)"/><circle cx="10" cy="14" r="2.4" fill="var(--ink)"/></svg>`;
}

export function heroPlumb(onDark = false) {
  const ink = onDark ? "var(--paper)" : "var(--ink)";
  return `<svg viewBox="0 0 240 440" aria-hidden="true">
    <line x1="20" y1="2" x2="220" y2="2" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>
    <line class="true-line" x1="120" y1="12" x2="120" y2="438" stroke="var(--ink-3)" stroke-width="1"/>
    <g class="swing">
      <line x1="120" y1="2" x2="120" y2="318" stroke="${ink}" stroke-width="1.6"/>
      <circle cx="120" cy="318" r="5" fill="${ink}"/>
      <path d="M120 318 L146 352 L120 410 L94 352 Z" fill="var(--brass)"/>
      <path d="M120 318 L146 352 L120 410 Z" fill="var(--ink)" fill-opacity=".14"/>
    </g>
  </svg>`;
}
