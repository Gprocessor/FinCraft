/* FinCraft · pages/misc/navigation.js — the Navigation preferences view.
   Auto-split from the original monolithic pages/misc.js for maintainability. */

import { api } from '../../api.js';
import { toast } from '../../ui.js';
import { escapeHtml } from '../../utils.js';

import { extractFineractError } from '../../ui/dom-helpers.js';
export async function navigation(c) {
  c.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Navigation</h1>
        <div class="page-subtitle">Drill down: Office → Staff → Clients</div>
      </div>
    </div>
    <div id="nav-tree" class="card">
      <div class="card-body">
        <div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin empty-state-icon"></i><h3>Loading…</h3></div>
      </div>
    </div>
  `;

  try {
    const [offRes, staffRes] = await Promise.all([
      api.offices.list(),
      api.staff.list()
    ]);
    const offices = Array.isArray(offRes) ? offRes : [];
    const staff   = Array.isArray(staffRes) ? staffRes : (staffRes?.pageItems || []);
    const tree    = c.querySelector('#nav-tree .card-body');

    if (!offices.length) {
      tree.innerHTML = '<div class="empty-state"><i class="fa-solid fa-building-circle-xmark empty-state-icon"></i><h3>No offices found</h3></div>';
      return;
    }

    tree.innerHTML = offices.map(o => {
      const officeStaff = staff.filter(s => s.officeId === o.id);
      return `
        <div class="card mb-2">
          <div class="card-header" style="cursor:pointer" data-toggle-office="${o.id}">
            <h3 class="card-title">
              <i class="fa-solid fa-chevron-right" style="font-size:9px;margin-right:6px;transition:transform 200ms" data-chevron="${o.id}"></i>
              <i class="fa-solid fa-building text-teal" style="margin-right:6px"></i>
              ${escapeHtml(o.name)}
            </h3>
            <span class="text-muted small">${officeStaff.length} staff</span>
          </div>
          <div class="card-body" data-office-body="${o.id}" style="display:none;padding-top:0">
            ${officeStaff.length ? officeStaff.map(s => `
              <div class="flex items-center gap-2" style="padding:8px 0;border-bottom:1px solid var(--border-1);cursor:pointer" data-view-staff="${s.id}" data-staff-name="${escapeHtml(s.displayName)}">
                <div class="avatar av-sm">${escapeHtml((s.displayName || '?').slice(0, 2).toUpperCase())}</div>
                <div style="flex:1">
                  <div class="fw-600">${escapeHtml(s.displayName)}</div>
                  <div class="text-muted small">${s.isLoanOfficer ? 'Loan Officer' : 'Staff'} · ${s.isActive ? 'Active' : 'Inactive'}</div>
                </div>
                <button class="btn-ghost btn-xs"><i class="fa-solid fa-arrow-right"></i></button>
              </div>
            `).join('') : '<div class="text-muted small text-center" style="padding:12px">No staff assigned</div>'}
          </div>
        </div>
      `;
    }).join('');

    // Toggle office expand
    tree.querySelectorAll('[data-toggle-office]').forEach(header =>
      header.addEventListener('click', () => {
        const id = header.dataset.toggleOffice;
        const body = tree.querySelector(`[data-office-body="${id}"]`);
        const chevron = tree.querySelector(`[data-chevron="${id}"]`);
        const isOpen = body.style.display !== 'none';
        body.style.display = isOpen ? 'none' : '';
        if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(90deg)';
      })
    );

    // Click staff to view their clients
    tree.querySelectorAll('[data-view-staff]').forEach(row =>
      row.addEventListener('click', () => {
        const staffId = row.dataset.viewStaff;
        const staffName = row.dataset.staffName;
        location.hash = `#/clients?staffId=${staffId}`;
        toast('info', staffName, 'Viewing assigned clients');
      })
    );
  } catch (e) {
    c.querySelector('#nav-tree .card-body').innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-triangle-exclamation empty-state-icon"></i>
        <h3>Failed to load</h3>
        <p>${escapeHtml(extractFineractError(e) || '')}</p>
      </div>
    `;
  }
}
