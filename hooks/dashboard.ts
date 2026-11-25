import type { Report } from "../types";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const usd = (n: number) => `$${n.toFixed(2)}`;

function bars(r: Report): string {
  const w = 720;
  const h = 220;
  const pad = 28;
  const max = Math.max(0.01, ...r.days.map((d) => d.usd));
  const bw = (w - pad * 2) / r.days.length;
  const parts = r.days.map((d, i) => {
    const bh = ((h - pad * 2) * d.usd) / max;
    const x = pad + i * bw + 2;
    const y = h - pad - bh;
    const label = d.day.slice(5);
    return (
      `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 4).toFixed(1)}" height="${bh.toFixed(1)}" rx="3" class="bar"><title>${d.day}: ${usd(d.usd)}</title></rect>` +
      `<text x="${(x + (bw - 4) / 2).toFixed(1)}" y="${h - pad + 14}" class="axis" text-anchor="middle">${label}</text>`
    );
  });
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Daily cost, last ${r.days.length} days" class="chart">
<line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" class="base"/>
<text x="${pad}" y="${pad - 10}" class="axis">max ${usd(max)}</text>
${parts.join("\n")}
</svg>`;
}

/** A self-contained HTML page of the report: no scripts, no network. */
export function dashboardHtml(r: Report, generatedAt: string): string {
  const rows = r.tasks
    .slice()
    .reverse()
    .map(
      (t) =>
        `<tr><td>${esc(t.day)}</td><td>${esc(t.text)}</td><td>${esc(t.kind)}</td><td class="num">${usd(t.p50)}</td><td class="num">${usd(t.actual)}</td><td class="num">${t.limit === null ? "—" : usd(t.limit)}</td><td>${t.isStopped ? "paused at limit" : "finished"}</td></tr>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Claude Cost Dashboard</title>
<style>
:root{--bg:#f7f7f5;--card:#fff;--ink:#1d1d1b;--dim:#6b6b66;--bar:#3b6fd8;--line:#ddd}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--card:#222220;--ink:#eeeeea;--dim:#a3a39c;--bar:#7aa2f7;--line:#3a3a37}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,Segoe UI,sans-serif}
main{max-width:960px;margin:0 auto;padding:24px 16px}
h1{font-size:22px;margin:0 0 4px}.sub{color:var(--dim);margin:0 0 20px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px}
.tile,.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px}
.tile b{display:block;font-size:24px}.tile span{color:var(--dim);font-size:13px}
.chart{width:100%;height:auto}.bar{fill:var(--bar)}.axis{fill:var(--dim);font-size:10px}.base{stroke:var(--line)}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}
.num{text-align:right;font-variant-numeric:tabular-nums}.wrap{overflow-x:auto}
footer{color:var(--dim);font-size:12px;margin-top:20px}
</style></head><body><main>
<h1>Claude Code cost dashboard</h1>
<p class="sub">Generated ${esc(generatedAt)} · daily figures from ${esc(r.source)}</p>
<div class="tiles">
<div class="tile"><span>Today</span><b>${usd(r.today)}</b></div>
<div class="tile"><span>Last 7 days</span><b>${usd(r.last7)}</b></div>
<div class="tile"><span>Last 30 days</span><b>${usd(r.last30)}</b></div>
<div class="tile"><span>Tasks within the estimate range</span><b>${r.score.n ? `${Math.round(r.score.within * 100)}%` : "—"}</b></div>
</div>
<div class="card"><h2 style="font-size:16px;margin:0 0 8px">Daily cost, last ${r.days.length} days</h2>${bars(r)}</div>
<div class="card" style="margin-top:12px"><h2 style="font-size:16px;margin:0 0 8px">Recent tasks: estimate vs actual</h2>
<div class="wrap"><table><thead><tr><th>Day</th><th>Task</th><th>Kind</th><th class="num">Estimate</th><th class="num">Actual</th><th class="num">Limit</th><th>Result</th></tr></thead>
<tbody>${rows || '<tr><td colspan="7">No tasks recorded yet.</td></tr>'}</tbody></table></div></div>
<div class="card" style="margin-top:12px"><h2 style="font-size:16px;margin:0 0 8px">This week: where it went and what would save the most</h2>
${
  r.digest.tasks
    ? `<p style="margin:0 0 8px">${usd(r.digest.total)} over ${r.digest.tasks} tasks. By kind: ${r.digest.byKind.map((k) => `${esc(k.kind)} ${usd(k.usd)}`).join(", ")}.</p>
<p style="margin:0 0 4px"><b>Costliest tasks</b></p><ul style="margin:0 0 8px;padding-left:20px">${r.digest.top.map((t) => `<li>${usd(t.usd)}: ${esc(t.text)}</li>`).join("")}</ul>
${r.digest.habits.length ? `<p style="margin:0 0 4px"><b>Habits that would save the most</b> (rough figures)</p><ul style="margin:0;padding-left:20px">${r.digest.habits.map((h) => `<li>${esc(h.text)}${h.saves > 0 ? ` Could save about ${usd(h.saves)} a week.` : ""}</li>`).join("")}</ul>` : '<p style="margin:0">No costly habits stood out this week.</p>'}`
    : '<p style="margin:0">No tasks recorded in the last seven days.</p>'
}</div>
<div class="card" style="margin-top:12px"><h2 style="font-size:16px;margin:0 0 8px">Estimate accuracy</h2>
${
  r.score.n
    ? `<p style="margin:0 0 8px">${Math.round(r.score.within * 100)}% of ${r.score.n} finished tasks cost no more than the 80% figure (the aim is about 80%). The typical task cost ${r.score.medianRatio.toFixed(2)}× its likely estimate.${r.score.recent !== null && r.score.prior !== null ? ` Latest 20 tasks: ${Math.round(r.score.recent * 100)}%, the 20 before: ${Math.round(r.score.prior * 100)}%.` : ""}</p>
<div class="wrap"><table><thead><tr><th>Kind</th><th class="num">Tasks</th><th class="num">Within range</th></tr></thead><tbody>${r.score.byKind.map((k) => `<tr><td>${esc(k.kind)}</td><td class="num">${k.n}</td><td class="num">${Math.round(k.within * 100)}%</td></tr>`).join("")}</tbody></table></div>`
    : '<p style="margin:0">No finished tasks yet.</p>'
}</div>
<footer>All figures are client-side estimates at list prices and can differ from your invoice; the bill is the authority. Made by the Cost Guard mod (Anantha Dommeti).</footer>
</main></body></html>
`;
}
