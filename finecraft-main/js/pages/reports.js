/* FinCraft · reports.js — Live API */
import { api } from '../api.js';
import { escapeHtml } from '../utils.js';
import { toast } from '../ui.js';

const CATS = ['All', 'Client', 'Loan', 'Savings', 'Accounting', 'Audit'];
const ICONS = { Client: 'fa-users', Loan: 'fa-hand-holding-dollar', Savings: 'fa-piggy-bank', Accounting: 'fa-calculator', Audit: 'fa-clipboard-check' };

export async function render(c) {
  c.innerHTML = `
  <div class="page active">
    <div class="page-header">
      <div><h1 class="page-title">Reports</h1><div class="page-subtitle">Standard & ad-hoc reports</div></div>
      <button class="btn-ghost" data-modal="adhocQueryModal"><i class="fa-solid fa-terminal"></i> Ad-hoc Query</button>
    </div>
    <div class="card">
      <div class="filter-bar" id="rep-cats">
        ${CATS.map((cat, i) => `<button class="btn-sm ${i === 0 ? 'btn-primary' : 'btn-ghost'}" data-cat="${cat}">${cat}</button>`).join('')}
        <input class="form-control" id="rep-search" placeholder="Filter reports…" style="max-width:220px;margin-left:auto" />
      </div>
      <div id="rep-loading" class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i><div>Loading reports…</div></div>
      <div class="grid-3" id="rep-grid" style="display:none"></div>
    </div>
  </div>`;

  let reports = [];
  try {
    const res = await api.reports.list();
    reports = Array.isArray(res) ? res : [];
    c.querySelector('#rep-loading').style.display = 'none';
    c.querySelector('#rep-grid').style.display = '';
  } catch (e) {
    c.querySelector('#rep-loading').innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i><div>${escapeHtml(e.message)}</div>`;
    return;
  }

  let activeCat = 'All';
  let searchQ = '';

  function draw() {
    let filtered = activeCat === 'All' ? reports : reports.filter(r => r.reportCategory === activeCat);
    if (searchQ) filtered = filtered.filter(r => r.reportName.toLowerCase().includes(searchQ));
    c.querySelector('#rep-grid').innerHTML = filtered.map(r => `
      <div class="card" style="margin:0">
        <div class="flex items-center gap-3 mb-2">
          <div class="brand-mark" style="width:36px;height:36px;font-size:18px"><i class="fa-solid ${ICONS[r.reportCategory] || 'fa-file'}"></i></div>
          <div>
            <div><b>${escapeHtml(r.reportName)}</b></div>
            <span class="badge b-teal">${escapeHtml(r.reportCategory || '—')}</span>
          </div>
        </div>
        <button class="btn-primary btn-sm w-full" data-modal="runReportModal" data-report="${escapeHtml(r.reportName)}" data-report-id="${r.id}">
          <i class="fa-solid fa-play"></i> Run
        </button>
      </div>`).join('')
      || `<div class="empty-state" style="grid-column:1/-1"><i class="fa-solid fa-file-circle-question"></i><div>No reports match</div></div>`;
  }
  draw();

  c.querySelectorAll('[data-cat]').forEach(btn => btn.addEventListener('click', () => {
    c.querySelectorAll('[data-cat]').forEach(b => { b.classList.remove('btn-primary'); b.classList.add('btn-ghost'); });
    btn.classList.add('btn-primary'); btn.classList.remove('btn-ghost');
    activeCat = btn.dataset.cat; draw();
  }));
  c.querySelector('#rep-search').addEventListener('input', e => { searchQ = e.target.value.toLowerCase(); draw(); });
}
