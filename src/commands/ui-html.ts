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
 * （プロジェクト統計ツール準拠デザインシステム: #09090b 背景, #121215 カード, #27272a ボーダー）
 */
export function getDashboardHtml(initialTargetDir: string = ""): string {
  const escapedDir = escapeHtml(initialTargetDir);

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>shipguard Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #09090b;
      --card-bg: #121215;
      --card-hover: #18181b;
      --border: #27272a;
      --border-focus: #3f3f46;
      --text: #fafafa;
      --text-muted: #a1a1aa;
      --accent: #38bdf8;
      --accent-hover: #0ea5e9;
      --critical: #ef4444;
      --high: #f97316;
      --medium: #eab308;
      --low: #3b82f6;
      --pass: #10b981;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }
    body { background-color: var(--bg); color: var(--text); min-height: 100vh; padding: 2rem 1.5rem; }
    .container { max-width: 1100px; margin: 0 auto; }
    header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.75rem; border-bottom: 1px solid var(--border); padding-bottom: 1.25rem; }
    .brand { display: flex; align-items: center; gap: 0.75rem; }
    .brand-icon { font-size: 1.75rem; }
    .brand h1 { font-size: 1.4rem; font-weight: 700; color: #fafafa; letter-spacing: -0.02em; }
    .brand p { font-size: 0.8rem; color: var(--text-muted); }
    .target-box { background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; padding: 0.85rem 1.15rem; margin-bottom: 1.75rem; }
    .target-row { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
    .dir-input { flex: 1; min-width: 260px; background: #09090b; border: 1px solid var(--border); color: var(--text); padding: 0.55rem 0.9rem; border-radius: 6px; font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; outline: none; transition: border-color 0.2s; }
    .dir-input:focus { border-color: var(--accent); }
    .btn { background: #27272a; color: var(--text); font-weight: 600; font-size: 0.825rem; padding: 0.55rem 1rem; border-radius: 6px; border: 1px solid #3f3f46; cursor: pointer; display: flex; align-items: center; gap: 0.4rem; transition: all 0.15s; white-space: nowrap; }
    .btn:hover { background: #3f3f46; color: #fff; }
    .btn-primary { background: var(--accent); color: #09090b; border: 1px solid var(--accent); font-weight: 700; }
    .btn-primary:hover { background: var(--accent-hover); color: #09090b; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .nav-tabs { display: flex; gap: 0.25rem; margin-bottom: 1.5rem; border-bottom: 1px solid var(--border); }
    .tab-btn { background: none; border: none; color: var(--text-muted); padding: 0.65rem 1.1rem; font-size: 0.9rem; font-weight: 600; cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.15s; }
    .tab-btn.active { color: var(--text); border-bottom-color: var(--accent); }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.75rem; margin-bottom: 1.5rem; }
    .stat-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; }
    .stat-title { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600; margin-bottom: 0.4rem; letter-spacing: 0.05em; }
    .stat-value { font-size: 1.6rem; font-weight: 700; color: #fafafa; font-family: 'JetBrains Mono', monospace; }
    .controls { display: flex; gap: 0.4rem; margin-bottom: 1.25rem; flex-wrap: wrap; }
    .filter-btn { background: var(--card-bg); border: 1px solid var(--border); color: var(--text-muted); padding: 0.35rem 0.75rem; border-radius: 6px; font-size: 0.8rem; cursor: pointer; font-weight: 500; }
    .filter-btn.active, .filter-btn:hover { background: #18181b; color: var(--text); border-color: var(--border-focus); }
    .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 1.15rem; margin-bottom: 0.85rem; }
    .badge { font-size: 0.65rem; font-weight: 700; padding: 0.15rem 0.5rem; border-radius: 4px; font-family: 'JetBrains Mono', monospace; }
    .badge-critical { background: rgba(239, 68, 68, 0.2); color: var(--critical); border: 1px solid var(--critical); }
    .badge-high { background: rgba(249, 115, 22, 0.2); color: var(--high); border: 1px solid var(--high); }
    .badge-medium { background: rgba(234, 179, 8, 0.2); color: var(--medium); border: 1px solid var(--medium); }
    .badge-low { background: rgba(59, 130, 246, 0.2); color: var(--low); border: 1px solid var(--low); }
    .loc-text { font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; color: var(--accent); margin: 0.4rem 0; }
    .code-box { background: #09090b; border: 1px solid var(--border); border-radius: 6px; padding: 0.7rem 0.9rem; font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; color: #f87171; overflow-x: auto; margin-top: 0.5rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th, td { text-align: left; padding: 0.65rem 0.85rem; border-bottom: 1px solid var(--border); font-family: 'JetBrains Mono', monospace; }
    th { color: var(--text-muted); font-size: 0.7rem; text-transform: uppercase; font-weight: 600; }
    .status-badge { padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: 700; font-size: 0.7rem; }
    .status-pass { background: rgba(16, 185, 129, 0.15); color: var(--pass); border: 1px solid var(--pass); }
    .status-fail { background: rgba(239, 68, 68, 0.15); color: var(--critical); border: 1px solid var(--critical); }
    .loading-spin { display: inline-block; width: 12px; height: 12px; border: 2px solid #09090b; border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; }
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
          <p>Local Pre-Launch Security &amp; Config Audit Dashboard</p>
        </div>
      </div>
    </header>

    <div class="target-box">
      <div class="target-row">
        <input type="text" id="targetDirInput" class="dir-input" value="${escapedDir}" placeholder="対象のフォルダまたはファイルパス..." onkeydown="if(event.key==='Enter') triggerScan()" />
        <button class="btn" onclick="browseFolder()">📁 フォルダ選択</button>
        <button class="btn" onclick="browseFile()">📄 ファイル選択</button>
        <button id="scanBtn" class="btn btn-primary" onclick="triggerScan()">⚡ スキャン実行</button>
      </div>
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

    async function browseFolder() {
      const res = await fetch('/api/browse-folder', { method: 'POST' });
      const data = await res.json();
      if (data.path) {
        document.getElementById('targetDirInput').value = data.path;
        triggerScan();
      }
    }

    async function browseFile() {
      const res = await fetch('/api/browse-file', { method: 'POST' });
      const data = await res.json();
      if (data.path) {
        document.getElementById('targetDirInput').value = data.path;
        triggerScan();
      }
    }

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
        list.innerHTML = '<div class="card" style="text-align:center; padding:3rem; color:var(--pass); font-weight:600;">🎉 違反は検知されませんでした。デプロイ準備完了です。</div>';
      } else {
        list.innerHTML = current.violations.map(v => \`
          <div class="card v-card" data-severity="\${v.severity}">
            <div style="display:flex; align-items:center; gap:0.6rem; margin-bottom:0.4rem;">
              <span class="badge badge-\${v.severity}">\${v.severity.toUpperCase()}</span>
              <strong>\${v.ruleId}</strong>
              <span style="color:var(--text-muted); font-size:0.85rem;">\${v.ruleName}</span>
            </div>
            <div class="loc-text">📁 \${v.filePath}:\${v.line}\${v.column ? ':' + v.column : ''}</div>
            <div style="font-size:0.875rem; margin-bottom:0.4rem;">\${v.message}</div>
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
      btn.innerHTML = '<span class="loading-spin"></span>';
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
