import type { ScanResult, Violation } from "../types/index.js";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getSeverityClass(severity: Violation["severity"]): string {
  switch (severity) {
    case "critical":
      return "badge-critical";
    case "high":
      return "badge-high";
    case "medium":
      return "badge-medium";
    case "low":
      return "badge-low";
  }
}

/**
 * 監査結果をスタンドアロンの美しい HTML レポートとして生成
 */
export function formatHtmlReport(result: ScanResult): string {
  const { summary, violations, timestamp, gitCommitHash } = result;

  const statusBadge = summary.passed
    ? '<span class="status-badge status-pass">PASSED</span>'
    : '<span class="status-badge status-fail">FAILED</span>';

  const violationsHtml =
    violations.length === 0
      ? '<div class="no-violations">🎉 違反は検知されませんでした。デプロイ準備完了です。</div>'
      : violations
          .map((v, i) => {
            const badgeClass = getSeverityClass(v.severity);
            const loc = `${escapeHtml(v.filePath)}:${v.line}${v.column ? `:${v.column}` : ""}`;
            const snippetHtml = v.snippet
              ? `<div class="code-box"><code>${escapeHtml(v.snippet)}</code></div>`
              : "";

            return `
        <div class="card violation-card" data-severity="${v.severity}">
          <div class="card-header">
            <span class="badge ${badgeClass}">${v.severity.toUpperCase()}</span>
            <span class="rule-id">${escapeHtml(v.ruleId)}</span>
            <span class="rule-name">${escapeHtml(v.ruleName)}</span>
          </div>
          <div class="loc-text">📁 ${loc}</div>
          <div class="msg-text">${escapeHtml(v.message)}</div>
          ${snippetHtml}
        </div>`;
          })
          .join("\n");

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>shipguard Audit Report</title>
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: rgba(18, 24, 38, 0.85);
      --border: rgba(255, 255, 255, 0.08);
      --text: #e2e8f0;
      --text-muted: #94a3b8;
      --accent: #06b6d4;
      --critical: #ef4444;
      --high: #f97316;
      --medium: #f59e0b;
      --low: #3b82f6;
      --pass: #10b981;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    body { background-color: var(--bg); color: var(--text); min-height: 100vh; padding: 2rem 1rem; }
    .container { max-width: 1000px; margin: 0 auto; }
    header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; border-bottom: 1px solid var(--border); padding-bottom: 1.5rem; }
    .brand { display: flex; align-items: center; gap: 0.75rem; }
    .brand-icon { font-size: 1.75rem; }
    .brand h1 { font-size: 1.5rem; font-weight: 700; color: #fff; letter-spacing: -0.025em; }
    .brand p { font-size: 0.875rem; color: var(--text-muted); }
    .status-badge { padding: 0.5rem 1rem; border-radius: 9999px; font-weight: 700; font-size: 0.875rem; letter-spacing: 0.05em; }
    .status-pass { background: rgba(16, 185, 129, 0.15); color: var(--pass); border: 1px solid var(--pass); }
    .status-fail { background: rgba(239, 68, 68, 0.15); color: var(--critical); border: 1px solid var(--critical); }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .stat-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; backdrop-filter: blur(8px); }
    .stat-title { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600; margin-bottom: 0.5rem; }
    .stat-value { font-size: 1.75rem; font-weight: 700; color: #fff; }
    .stat-critical { color: var(--critical); }
    .stat-high { color: var(--high); }
    .stat-medium { color: var(--medium); }
    .stat-low { color: var(--low); }
    .controls { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
    .filter-btn { background: var(--card-bg); border: 1px solid var(--border); color: var(--text-muted); padding: 0.4rem 0.8rem; border-radius: 8px; font-size: 0.875rem; cursor: pointer; transition: all 0.2s; }
    .filter-btn.active, .filter-btn:hover { background: rgba(6, 182, 212, 0.15); color: var(--accent); border-color: var(--accent); }
    .violations-list { display: flex; flex-direction: column; gap: 1rem; }
    .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; backdrop-filter: blur(8px); transition: transform 0.2s; }
    .card:hover { transform: translateY(-2px); }
    .card-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; }
    .badge { font-size: 0.7rem; font-weight: 700; padding: 0.2rem 0.6rem; border-radius: 6px; letter-spacing: 0.05em; }
    .badge-critical { background: var(--critical); color: #fff; }
    .badge-high { background: var(--high); color: #fff; }
    .badge-medium { background: var(--medium); color: #000; }
    .badge-low { background: var(--low); color: #fff; }
    .rule-id { font-weight: 700; font-size: 0.95rem; color: #fff; }
    .rule-name { color: var(--text-muted); font-size: 0.875rem; }
    .loc-text { font-family: monospace; font-size: 0.85rem; color: var(--accent); margin-bottom: 0.5rem; }
    .msg-text { font-size: 0.9rem; color: var(--text); line-height: 1.5; margin-bottom: 0.75rem; }
    .code-box { background: #070a11; border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 8px; padding: 0.75rem 1rem; font-family: 'SFMono-Regular', Consolas, monospace; font-size: 0.85rem; color: #f87171; overflow-x: auto; }
    .no-violations { background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 12px; padding: 3rem; text-align: center; color: var(--pass); font-size: 1.1rem; font-weight: 600; }
    footer { text-align: center; margin-top: 3rem; color: var(--text-muted); font-size: 0.8rem; }
    footer a { color: var(--accent); text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="brand">
        <div class="brand-icon">🛡️</div>
        <div>
          <h1>shipguard</h1>
          <p>Pre-Launch Security &amp; Config Audit &bull; ${escapeHtml(timestamp)} ${gitCommitHash ? `&bull; Git: ${escapeHtml(gitCommitHash.substring(0, 7))}` : ""}</p>
        </div>
      </div>
      <div>${statusBadge}</div>
    </header>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-title">Files Scanned</div>
        <div class="stat-value">${summary.scannedFiles}</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">Total Violations</div>
        <div class="stat-value">${summary.totalViolations}</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">Critical</div>
        <div class="stat-value stat-critical">${summary.critical}</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">High</div>
        <div class="stat-value stat-high">${summary.high}</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">Medium</div>
        <div class="stat-value stat-medium">${summary.medium}</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">Low</div>
        <div class="stat-value stat-low">${summary.low}</div>
      </div>
    </div>

    <div class="controls">
      <button class="filter-btn active" onclick="filterViolations('all', this)">All (${summary.totalViolations})</button>
      <button class="filter-btn" onclick="filterViolations('critical', this)">Critical (${summary.critical})</button>
      <button class="filter-btn" onclick="filterViolations('high', this)">High (${summary.high})</button>
      <button class="filter-btn" onclick="filterViolations('medium', this)">Medium (${summary.medium})</button>
      <button class="filter-btn" onclick="filterViolations('low', this)">Low (${summary.low})</button>
    </div>

    <div class="violations-list" id="violationsList">
      ${violationsHtml}
    </div>

    <footer>
      Generated by <a href="https://github.com/tk030-lotto/shipguard" target="_blank" rel="noreferrer">shipguard</a> — Zero-cost local security auditor
    </footer>
  </div>

  <script>
    function filterViolations(severity, btn) {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const cards = document.querySelectorAll('.violation-card');
      cards.forEach(card => {
        if (severity === 'all' || card.getAttribute('data-severity') === severity) {
          card.style.display = 'block';
        } else {
          card.style.display = 'none';
        }
      });
    }
  </script>
</body>
</html>`;
}
