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
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #09090b;
      --card-bg: #121215;
      --card-hover: #18181b;
      --border: #27272a;
      --text: #fafafa;
      --text-muted: #a1a1aa;
      --accent: #38bdf8;
      --critical: #ef4444;
      --high: #f97316;
      --medium: #eab308;
      --low: #3b82f6;
      --pass: #10b981;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }
    body { background-color: var(--bg); color: var(--text); min-height: 100vh; padding: 2rem 1.5rem; }
    .container { max-width: 1000px; margin: 0 auto; }
    header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; border-bottom: 1px solid var(--border); padding-bottom: 1.25rem; }
    .brand { display: flex; align-items: center; gap: 0.75rem; }
    .brand-icon { font-size: 1.75rem; }
    .brand h1 { font-size: 1.4rem; font-weight: 700; color: #fafafa; letter-spacing: -0.02em; }
    .brand p { font-size: 0.8rem; color: var(--text-muted); }
    .status-badge { padding: 0.35rem 0.8rem; border-radius: 6px; font-weight: 700; font-size: 0.8rem; font-family: 'JetBrains Mono', monospace; }
    .status-pass { background: rgba(16, 185, 129, 0.15); color: var(--pass); border: 1px solid var(--pass); }
    .status-fail { background: rgba(239, 68, 68, 0.15); color: var(--critical); border: 1px solid var(--critical); }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 0.75rem; margin-bottom: 1.75rem; }
    .stat-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; }
    .stat-title { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600; margin-bottom: 0.4rem; letter-spacing: 0.05em; }
    .stat-value { font-size: 1.6rem; font-weight: 700; color: #fafafa; font-family: 'JetBrains Mono', monospace; }
    .stat-critical { color: var(--critical); }
    .stat-high { color: var(--high); }
    .stat-medium { color: var(--medium); }
    .stat-low { color: var(--low); }
    .controls { display: flex; gap: 0.4rem; margin-bottom: 1.25rem; flex-wrap: wrap; }
    .filter-btn { background: var(--card-bg); border: 1px solid var(--border); color: var(--text-muted); padding: 0.35rem 0.75rem; border-radius: 6px; font-size: 0.8rem; cursor: pointer; transition: all 0.15s; }
    .filter-btn.active, .filter-btn:hover { background: #18181b; color: var(--text); border-color: #3f3f46; }
    .violations-list { display: flex; flex-direction: column; gap: 0.75rem; }
    .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 1.15rem; }
    .card-header { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.5rem; }
    .badge { font-size: 0.65rem; font-weight: 700; padding: 0.15rem 0.5rem; border-radius: 4px; font-family: 'JetBrains Mono', monospace; }
    .badge-critical { background: rgba(239, 68, 68, 0.2); color: var(--critical); border: 1px solid var(--critical); }
    .badge-high { background: rgba(249, 115, 22, 0.2); color: var(--high); border: 1px solid var(--high); }
    .badge-medium { background: rgba(234, 179, 8, 0.2); color: var(--medium); border: 1px solid var(--medium); }
    .badge-low { background: rgba(59, 130, 246, 0.2); color: var(--low); border: 1px solid var(--low); }
    .rule-id { font-weight: 700; font-size: 0.9rem; color: #fafafa; font-family: 'JetBrains Mono', monospace; }
    .rule-name { color: var(--text-muted); font-size: 0.85rem; }
    .loc-text { font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; color: var(--accent); margin-bottom: 0.4rem; }
    .msg-text { font-size: 0.875rem; color: var(--text); line-height: 1.5; margin-bottom: 0.5rem; }
    .code-box { background: #09090b; border: 1px solid var(--border); border-radius: 6px; padding: 0.7rem 0.9rem; font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; color: #f87171; overflow-x: auto; }
    .no-violations { background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 8px; padding: 3rem; text-align: center; color: var(--pass); font-size: 1rem; font-weight: 600; }
    footer { text-align: center; margin-top: 2.5rem; color: var(--text-muted); font-size: 0.8rem; }
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
