function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * shipguard ローカルWeb UI ダッシュボードのHTMLテンプレート
 */
export function getDashboardHtml(initialTargetDir: string = ""): string {
  const escapedDir = escapeHtml(initialTargetDir);

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>shipguard Dashboard</title>
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
    body { background-color: var(--bg); color: var(--text); min-height: 100vh; padding: 2rem 1.5rem; }
    .container { max-width: 1100px; margin: 0 auto; }
    header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; border-bottom: 1px solid var(--border); padding-bottom: 1.25rem; }
    .brand { display: flex; align-items: center; gap: 0.75rem; }
    .brand-icon { font-size: 2rem; }
    .brand h1 { font-size: 1.5rem; font-weight: 800; color: #fff; letter-spacing: -0.025em; }
    .brand p { font-size: 0.85rem; color: var(--text-muted); }
    .dir-bar { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 0.75rem 1rem; display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.5rem; }
    .dir-icon { font-size: 1.25rem; }
    .dir-input { flex: 1; background: #070a11; border: 1px solid rgba(255, 255, 255, 0.1); color: #fff; padding: 0.6rem 1rem; border-radius: 8px; font-family: monospace; font-size: 0.9rem; outline: none; transition: border-color 0.2s; }
    .dir-input:focus { border-color: var(--accent); }
    .btn { background: var(--accent); color: #000; font-weight: 700; font-size: 0.875rem; padding: 0.6rem 1.25rem; border-radius: 8px; border: none; cursor: pointer; display: flex; align-items: center; gap: 0.5rem; transition: all 0.2s; white-space: nowrap; }
    .btn:hover { opacity: 0.9; transform: translateY(-1px); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .nav-tabs { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; border-bottom: 1px solid var(--border); }
    .tab-btn { background: none; border: none; color: var(--text-muted); padding: 0.75rem 1.25rem; font-size: 0.95rem; font-weight: 600; cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.2s; }
    .tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .stat-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; }
    .stat-title { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600; margin-bottom: 0.5rem; }
    .stat-value { font-size: 1.8rem; font-weight: 700; color: #fff; }
    .controls { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
    .filter-btn { background: var(--card-bg); border: 1px solid var(--border); color: var(--text-muted); padding: 0.4rem 0.8rem; border-radius: 8px; font-size: 0.85rem; cursor: pointer; }
    .filter-btn.active, .filter-btn:hover { background: rgba(6, 182, 212, 0.15); color: var(--accent); border-color: var(--accent); }
    .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; margin-bottom: 1rem; }
    .badge { font-size: 0.7rem; font-weight: 700; padding: 0.2rem 0.6rem; border-radius: 6px; }
    .badge-critical { background: var(--critical); color: #fff; }
    .badge-high { background: var(--high); color: #fff; }
    .badge-medium { background: var(--medium); color: #000; }
    .badge-low { background: var(--low); color: #fff; }
    .loc-text { font-family: monospace; font-size: 0.85rem; color: var(--accent); margin: 0.5rem 0; }
    .code-box { background: #070a11; border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 8px; padding: 0.75rem 1rem; font-family: monospace; font-size: 0.85rem; color: #f87171; overflow-x: auto; margin-top: 0.5rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    th, td { text-align: left; padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); }
    th { color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase; font-weight: 600; }
    .status-badge { padding: 0.25rem 0.6rem; border-radius: 9999px; font-weight: 700; font-size: 0.75rem; }
    .status-pass { background: rgba(16, 185, 129, 0.15); color: var(--pass); border: 1px solid var(--pass); }
    .status-fail { background: rgba(239, 68, 68, 0.15); color: var(--critical); border: 1px solid var(--critical); }
    .loading-spin { display: inline-block; width: 14px; height: 14px; border: 2px solid #000; border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="brand">
        <div class="brand-icon">🛡️</div>
        <div>
          <h1>shipguard UI</h1>
          <p>Local Security &amp; Config Audit Dashboard</p>
        </div>
      </div>
    </header>

    <div class="dir-bar">
      <span class="dir-icon">📁</span>
      <input type="text" id="targetDirInput" class="dir-input" value="${escapedDir}" placeholder="対象プロジェクトのパスを入力..." onkeydown="if(event.key==='Enter') triggerScan()" />
      <button id="scanBtn" class="btn" onclick="triggerScan()">⚡ スキャン実行</button>
    </div>

    <div class="nav-tabs">
      <button class="tab-btn active" onclick="switchTab('violations', this)">🔍 監査結果</button>
      <button class="tab-btn" onclick="switchTab('history', this)">📜 監査履歴タイムライン</button>
    </div>

    <div id="tab-violations">
      <div class="stats-grid" id="statsGrid"></div>
      <div class="controls" id="controls"></div>
      <div id="violationsList"></div>
    </div>

    <div id="tab-history" style="display: none;">
      <div class="card">
        <table>
          <thead>
            <tr>
              <th>実行日時 (UTC)</th>
              <th>結果</th>
              <th>コミット</th>
              <th>検知数</th>
              <th>CRITICAL</th>
              <th>HIGH</th>
              <th>MEDIUM</th>
              <th>LOW</th>
              <th>走査ファイル</th>
            </tr>
          </thead>
          <tbody id="historyTbody"></tbody>
        </table>
      </div>
    </div>
  </div>

  <script>
    let currentData = null;

    async function loadData(targetDir) {
      const url = targetDir ? '/api/status?targetDir=' + encodeURIComponent(targetDir) : '/api/status';
      const res = await fetch(url);
      currentData = await res.json();
      if (currentData.targetDir && !document.getElementById('targetDirInput').value) {
        document.getElementById('targetDirInput').value = currentData.targetDir;
      }
      renderDashboard(currentData);
    }

    function renderDashboard(data) {
      const { current, history } = data;
      const s = current ? current.summary : { scannedFiles: 0, totalViolations: 0, critical: 0, high: 0, medium: 0, low: 0, passed: true };
      document.getElementById('statsGrid').innerHTML = \`
        <div class="stat-card"><div class="stat-title">Files Scanned</div><div class="stat-value">\${s.scannedFiles}</div></div>
        <div class="stat-card"><div class="stat-title">Total Violations</div><div class="stat-value">\${s.totalViolations}</div></div>
        <div class="stat-card"><div class="stat-title">Critical</div><div class="stat-value" style="color:var(--critical)">\${s.critical}</div></div>
        <div class="stat-card"><div class="stat-title">High</div><div class="stat-value" style="color:var(--high)">\${s.high}</div></div>
        <div class="stat-card"><div class="stat-title">Medium</div><div class="stat-value" style="color:var(--medium)">\${s.medium}</div></div>
        <div class="stat-card"><div class="stat-title">Low</div><div class="stat-value" style="color:var(--low)">\${s.low}</div></div>
      \`;

      document.getElementById('controls').innerHTML = \`
        <button class="filter-btn active" onclick="filterV('all', this)">All (\${s.totalViolations})</button>
        <button class="filter-btn" onclick="filterV('critical', this)">Critical (\${s.critical})</button>
        <button class="filter-btn" onclick="filterV('high', this)">High (\${s.high})</button>
        <button class="filter-btn" onclick="filterV('medium', this)">Medium (\${s.medium})</button>
        <button class="filter-btn" onclick="filterV('low', this)">Low (\${s.low})</button>
      \`;

      const list = document.getElementById('violationsList');
      if (!current || current.violations.length === 0) {
        list.innerHTML = '<div class="card" style="text-align:center; padding:3rem; color:var(--pass); font-weight:700;">🎉 違反は検知されませんでした。デプロイ準備完了です。</div>';
      } else {
        list.innerHTML = current.violations.map(v => \`
          <div class="card v-card" data-severity="\${v.severity}">
            <div style="display:flex; align-items:center; gap:0.75rem; margin-bottom:0.5rem;">
              <span class="badge badge-\${v.severity}">\${v.severity.toUpperCase()}</span>
              <strong>\${v.ruleId}</strong>
              <span style="color:var(--text-muted)">\${v.ruleName}</span>
            </div>
            <div class="loc-text">📁 \${v.filePath}:\${v.line}\${v.column ? ':' + v.column : ''}</div>
            <div style="font-size:0.9rem; margin-bottom:0.5rem;">\${v.message}</div>
            \${v.snippet ? \`<div class="code-box"><code>\${v.snippet}</code></div>\` : ''}
          </div>
        \`).join('');
      }

      const tbody = document.getElementById('historyTbody');
      if (!history || history.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:var(--text-muted)">履歴はありません</td></tr>';
      } else {
        tbody.innerHTML = [...history].reverse().map(h => \`
          <tr>
            <td>\${h.timestamp}</td>
            <td><span class="status-badge \${h.passed ? 'status-pass' : 'status-fail'}">\${h.passed ? 'PASS' : 'FAIL'}</span></td>
            <td><code>\${h.gitCommitHash ? h.gitCommitHash.substring(0, 7) : '-'}</code></td>
            <td><strong>\${h.summary.totalViolations}</strong></td>
            <td style="color:var(--critical)">\${h.summary.critical}</td>
            <td style="color:var(--high)">\${h.summary.high}</td>
            <td style="color:var(--medium)">\${h.summary.medium}</td>
            <td style="color:var(--low)">\${h.summary.low}</td>
            <td>\${h.summary.scannedFiles}</td>
          </tr>
        \`).join('');
      }
    }

    function filterV(severity, btn) {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.v-card').forEach(card => {
        card.style.display = (severity === 'all' || card.getAttribute('data-severity') === severity) ? 'block' : 'none';
      });
    }

    function switchTab(tab, btn) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-violations').style.display = tab === 'violations' ? 'block' : 'none';
      document.getElementById('tab-history').style.display = tab === 'history' ? 'block' : 'none';
    }

    async function triggerScan() {
      const btn = document.getElementById('scanBtn');
      const targetDir = document.getElementById('targetDirInput').value.trim();
      btn.disabled = true;
      btn.innerHTML = '<span class="loading-spin"></span> スキャン中...';
      try {
        const res = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetDir })
        });
        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error || 'スキャンに失敗しました');
        }
        await loadData(targetDir);
      } catch (err) {
        alert('スキャン実行に失敗しました: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = '⚡ スキャン実行';
      }
    }

    loadData();
  </script>
</body>
</html>`;
}
