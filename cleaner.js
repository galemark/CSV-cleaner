// NotebookLM CSV Cleaner — cleaner.js

let cleanedCSV = '';
let editableCards = [];

// --- Drag & drop ---
function handleDragOver(e) {
  e.preventDefault();
  document.getElementById('drop-zone').classList.add('over');
}
function handleDragLeave(e) {
  document.getElementById('drop-zone').classList.remove('over');
}
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('drop-zone').classList.remove('over');
  const file = e.dataTransfer.files[0];
  if (file && file.name.endsWith('.csv')) readFile(file);
}
function handleFile(e) {
  const file = e.target.files[0];
  if (file) readFile(file);
}
function readFile(file) {
  document.getElementById('file-name').textContent = file.name;
  const baseName = file.name.replace(/\.csv$/i, '');
  document.getElementById('filename-input').value = baseName;
  const reader = new FileReader();
  reader.onload = (e) => { document.getElementById('csv-input').value = e.target.result; };
  reader.readAsText(file);
}

// --- LaTeX cleaning ---
function cleanText(text) {
  let fixes = 0;
  const original = text;

  // Named text wrappers WITH braces: $\text{foo}$, $\mathrm{foo}$, etc.
  text = text.replace(/\$?\\text\{([^}]*)\}\$?/g,   (_, m) => { fixes++; return m; });
  text = text.replace(/\$?\\mathrm\{([^}]*)\}\$?/g,  (_, m) => { fixes++; return m; });
  text = text.replace(/\$?\\mathbf\{([^}]*)\}\$?/g,  (_, m) => { fixes++; return m; });
  text = text.replace(/\$?\\textbf\{([^}]*)\}\$?/g,  (_, m) => { fixes++; return m; });
  text = text.replace(/\$?\\textit\{([^}]*)\}\$?/g,  (_, m) => { fixes++; return m; });

  // \text without braces: 150\text g → 150 g (grab optional following word)
  text = text.replace(/\\text\s+(\S+)/g, (_, m) => { fixes++; return ' ' + m; });
  text = text.replace(/\\text(\s*)/g, (_, sp) => { fixes++; return sp || ' '; });

  // Escaped percent: \% → %
  text = text.replace(/\\%/g, () => { fixes++; return '%'; });

  // Fractions: \frac{a}{b} → a/b
  text = text.replace(/\$?\\frac\{([^}]*)\}\{([^}]*)\}\$?/g, (_, a, b) => { fixes++; return `${a}/${b}`; });

  // Degree symbol: 30^{\circ} or $30^{\circ}$ or 30^{\circ}$
  text = text.replace(/\$?(\d+)\^\{\\circ\}\$?/g, (_, n) => { fixes++; return `${n}\u00B0`; });
  text = text.replace(/\$?\\circ\$?/g, () => { fixes++; return '\u00B0'; });

  // Superscripts
  const supMap = { '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','+':'⁺','-':'⁻' };
  text = text.replace(/\$?(\w+)\^\{([^}]+)\}\$?/g, (_, base, exp) => {
    fixes++;
    return base + exp.split('').map(c => supMap[c] || c).join('');
  });
  text = text.replace(/\$?(\w+)\^(\w)\$?/g, (_, base, exp) => {
    fixes++;
    return base + (supMap[exp] || '^' + exp);
  });

  // Subscripts
  const subMap = { '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉','+':'₊','-':'₋' };
  text = text.replace(/\$?(\w+)_\{([^}]+)\}\$?/g, (_, base, sub) => {
    fixes++;
    return base + sub.split('').map(c => subMap[c] || c).join('');
  });
  text = text.replace(/\$?(\w+)_(\w)\$?/g, (_, base, sub) => {
    fixes++;
    return base + (subMap[sub] || '_' + sub);
  });

  // Greek letters
  const greek = {
    alpha:'α', beta:'β', gamma:'γ', delta:'δ', epsilon:'ε', zeta:'ζ',
    eta:'η', theta:'θ', iota:'ι', kappa:'κ', lambda:'λ', mu:'μ',
    nu:'ν', xi:'ξ', pi:'π', rho:'ρ', sigma:'σ', tau:'τ',
    upsilon:'υ', phi:'φ', chi:'χ', psi:'ψ', omega:'ω',
    Alpha:'Α', Beta:'Β', Gamma:'Γ', Delta:'Δ', Epsilon:'Ε',
    Theta:'Θ', Lambda:'Λ', Mu:'Μ', Pi:'Π', Sigma:'Σ',
    Phi:'Φ', Psi:'Ψ', Omega:'Ω'
  };
  text = text.replace(/\$?\\([a-zA-Z]+)\$?/g, (match, name) => {
    if (greek[name]) { fixes++; return greek[name]; }
    return match;
  });

  // Math symbols
  const mathSymbols = {
    times:'×', div:'÷', pm:'±', leq:'≤', geq:'≥',
    neq:'≠', approx:'≈', rightarrow:'→', leftarrow:'←',
    to:'→', infty:'∞', degree:'°'
  };
  Object.entries(mathSymbols).forEach(([cmd, sym]) => {
    const re = new RegExp('\\\\' + cmd, 'g');
    const before = text;
    text = text.replace(re, sym);
    if (text !== before) fixes++;
  });

  // Remaining paired $...$
  text = text.replace(/\$([^$\n]{1,30})\$/g, (_, m) => { fixes++; return m.trim(); });

  // Strip ALL remaining lone $ signs
  text = text.replace(/\$/g, () => { fixes++; return ''; });

  // Cleanup leftover LaTeX noise
  text = text.replace(/\\\\/g, ' ');
  text = text.replace(/\\[,;!]/g, ' ');
  text = text.replace(/[{}]/g, '');
  text = text.replace(/\s{2,}/g, ' ').trim();

  return { cleaned: text, fixes: text !== original ? Math.max(fixes, 1) : 0 };
}

// --- CSV parser (handles quoted fields) ---
function parseCSV(raw) {
  const rows = [];
  let i = 0;
  while (i < raw.length) {
    const row = [];
    while (i < raw.length && raw[i] !== '\n') {
      if (raw[i] === '"') {
        let cell = ''; i++;
        while (i < raw.length) {
          if (raw[i] === '"' && raw[i + 1] === '"') { cell += '"'; i += 2; }
          else if (raw[i] === '"') { i++; break; }
          else { cell += raw[i]; i++; }
        }
        row.push(cell);
        if (raw[i] === ',') i++;
      } else {
        let cell = '';
        while (i < raw.length && raw[i] !== ',' && raw[i] !== '\n') { cell += raw[i]; i++; }
        row.push(cell);
        if (raw[i] === ',') i++;
      }
    }
    if (raw[i] === '\n') i++;
    if (row.some(c => c.trim())) rows.push(row);
  }
  return rows;
}

function toCSVRow(cells) {
  return cells.map(c => {
    if (c.includes(',') || c.includes('"') || c.includes('\n')) return `"${c.replace(/"/g, '""')}"`;
    return c;
  }).join(',');
}

// --- Main clean action ---
function cleanCSV() {
  const input = document.getElementById('csv-input').value.trim();
  const errEl = document.getElementById('error-msg');
  errEl.classList.add('hidden');

  if (!input) {
    errEl.textContent = 'Please paste or upload a CSV first.';
    errEl.classList.remove('hidden');
    return;
  }

  const rows = parseCSV(input);
  if (rows.length === 0) {
    errEl.textContent = 'No valid rows found. Make sure your CSV is formatted correctly.';
    errEl.classList.remove('hidden');
    return;
  }

  let totalFixes = 0;
  const cleanedRows = rows.map(row =>
    row.map(cell => {
      const { cleaned, fixes } = cleanText(cell);
      totalFixes += fixes;
      return cleaned;
    })
  );

  // Store editable cards (copy so edits don't affect re-clean)
  editableCards = cleanedRows.map(row => ({ front: row[0] || '', back: row[1] || '', deleted: false }));

  // Stats
  document.getElementById('stat-cards').textContent = rows.length;
  document.getElementById('stat-fixes').textContent = totalFixes;
  const statusEl = document.getElementById('stat-status');
  statusEl.textContent = totalFixes > 0 ? 'Fixed ✓' : 'Clean ✓';

  renderCardEditor();
  rebuildCSV();

  document.getElementById('results-section').classList.remove('hidden');
}

function autoSize(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

// --- Card editor ---
function renderCardEditor() {
  const tbody = document.getElementById('card-editor');
  tbody.innerHTML = '';

  let visibleNum = 0;
  editableCards.forEach((card, idx) => {
    if (card.deleted) return;
    visibleNum++;

    const tr = document.createElement('tr');
    tr.dataset.idx = idx;
    tr.innerHTML = `
      <td class="td-num">${visibleNum}</td>
      <td class="td-sep"></td>
      <td><textarea class="cell-input" data-idx="${idx}" data-field="front" oninput="handleCardEdit(this)" rows="1">${escapeHTML(card.front)}</textarea></td>
      <td class="td-sep"></td>
      <td><textarea class="cell-input" data-idx="${idx}" data-field="back" oninput="handleCardEdit(this)" rows="1">${escapeHTML(card.back)}</textarea></td>
      <td class="td-sep"></td>
      <td class="td-del">
        <button class="del-btn" onclick="deleteCard(${idx})" title="Delete card" aria-label="Delete card">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
            <path d="M2 3.5h10M5.5 3.5V2.5a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v1M3.5 3.5l.7 7.5a.5.5 0 00.5.5h4.6a.5.5 0 00.5-.5l.7-7.5"/>
          </svg>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Auto-size all textareas after DOM is populated
  tbody.querySelectorAll('.cell-input').forEach(autoSize);

  updateCardCount();
}

function handleCardEdit(el) {
  const idx = parseInt(el.dataset.idx);
  const field = el.dataset.field;
  editableCards[idx][field] = el.value;
  autoSize(el);
  rebuildCSV();
}

function deleteCard(idx) {
  editableCards[idx].deleted = true;
  renderCardEditor();
  rebuildCSV();
  updateCardCount();
}

function updateCardCount() {
  const active = editableCards.filter(c => !c.deleted).length;
  document.getElementById('stat-cards').textContent = active;
}

function rebuildCSV() {
  const rows = editableCards
    .filter(c => !c.deleted)
    .map(c => toCSVRow([c.front, c.back]));
  cleanedCSV = rows.join('\n');
}

function escapeHTML(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function downloadCSV() {
  if (!cleanedCSV) return;
  const rawName = document.getElementById('filename-input').value.trim() || 'anki_ready';
  const safeName = rawName.replace(/[\/\\:*?"<>|]/g, '').replace(/\s+/g, '_') || 'anki_ready';
  const blob = new Blob([cleanedCSV], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function clearAll() {
  document.getElementById('csv-input').value = '';
  document.getElementById('file-name').textContent = '';
  document.getElementById('file-input').value = '';
  document.getElementById('filename-input').value = 'anki_ready';
  document.getElementById('results-section').classList.add('hidden');
  document.getElementById('error-msg').classList.add('hidden');
  cleanedCSV = '';
  editableCards = [];
}
