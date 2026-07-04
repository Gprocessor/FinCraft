/* FinCraft · pages/products/actions/config.js — tax, delinquency bucket, and product mix modals.
   Auto-split (2nd pass) from pages/products/actions.js for maintainability. */

import { DATE_FORMAT, LOCALE, today } from '../../../config.js';
import { api } from '../../../api.js';
import { escapeHtml } from '../../../utils.js';
import { glOptions, modal, v, vf, vi } from '../shared.js';
import { toast } from '../../../ui.js';

export async function openTaxModal(forceType, taxId, onSuccess) {
  const isEdit = !!taxId;
  const glOpts = await glOptions();

  // On edit, fetch the right entity based on forceType
  let existing = {};
  if (isEdit) {
    try {
      existing = forceType === 'component'
        ? await api.taxComponents.get(taxId)
        : await api.taxGroups.get(taxId);
    } catch {}
  }

  const initialType = forceType || 'component';
  const mid = 'tax-modal-' + Date.now();
  const el = modal(mid, isEdit ? 'Edit Tax' : 'New Tax', `
    <label>Type *
      <select id="tax-type" class="form-control" ${isEdit ? 'disabled' : ''} required>
        <option value="component" ${initialType === 'component' ? 'selected' : ''}>Tax Component</option>
        <option value="group"     ${initialType === 'group' ? 'selected' : ''}>Tax Group</option>
      </select>
    </label>

    <div id="tax-component-wrap" style="${initialType === 'component' ? '' : 'display:none'}">
      <h4 class="mt-3">Component Details</h4>
      <div class="form-grid">
        <label>Component name * <input id="tc-name" class="form-control" value="${escapeHtml(existing.name || '')}" required/></label>
        <label>Percentage * <input type="number" step="0.01" id="tc-pct" class="form-control" value="${existing.percentage ?? ''}" required/></label>
        <label>Start date * <input type="date" id="tc-start" class="form-control" value="${existing.startDate ? (Array.isArray(existing.startDate) ? existing.startDate.join('-') : existing.startDate) : today()}" required/></label>
        <label>Credit account *
          <select id="gl-tc-credit" class="form-control" required>
            <option value="">— Select GL account —</option>${glOpts}
          </select>
        </label>
        <label>Debit account *
          <select id="gl-tc-debit" class="form-control" required>
            <option value="">— Select GL account —</option>${glOpts}
          </select>
        </label>
      </div>
    </div>

    <div id="tax-group-wrap" style="${initialType === 'group' ? '' : 'display:none'}">
      <h4 class="mt-3">Group Details</h4>
      <div class="form-grid">
        <label>Group name * <input id="tg-name" class="form-control" value="${escapeHtml(existing.name || '')}" required/></label>
        <label>Start date * <input type="date" id="tg-start" class="form-control" value="${today()}" required/></label>
      </div>
      <div class="text-muted small mt-2">
        <i class="fa-solid fa-circle-info"></i>
        Add tax components to this group after creation under the group's detail view (managed via API).
      </div>
    </div>`);

  el.querySelector('#tax-type').addEventListener('change', (e) => {
    el.querySelector('#tax-component-wrap').style.display = e.target.value === 'component' ? '' : 'none';
    el.querySelector('#tax-group-wrap').style.display = e.target.value === 'group' ? '' : 'none';
  });

  // Pre-fill component-specific GL fields on edit
  if (isEdit && initialType === 'component') {
    if (existing.creditAccount?.id) el.querySelector('#gl-tc-credit').value = String(existing.creditAccount.id);
    if (existing.debitAccount?.id)  el.querySelector('#gl-tc-debit').value  = String(existing.debitAccount.id);
  }

  el.querySelector('#' + mid + '-save').addEventListener('click', async () => {
    const type = v(el, 'tax-type');
    try {
      if (type === 'component') {
        const name = v(el, 'tc-name');
        const pct = vf(el, 'tc-pct');
        const startDate = v(el, 'tc-start');
        const creditAccountId = vi(el, 'gl-tc-credit');
        const debitAccountId  = vi(el, 'gl-tc-debit');

        if (!name || pct === null || !startDate || !creditAccountId || !debitAccountId) {
          toast('warn', 'Fill required fields', '');
          return;
        }

        const payload = {
          name, percentage: pct, startDate,
          dateFormat: DATE_FORMAT, locale: LOCALE,
          creditAccountType: 2, creditAccountId,
          debitAccountType: 2, debitAccountId
        };

        if (isEdit) await api.taxComponents.update(taxId, payload);
        else        await api.taxComponents.create(payload);
      } else {
        const name = v(el, 'tg-name');
        const startDate = v(el, 'tg-start');

        if (!name || !startDate) {
          toast('warn', 'Fill required fields', '');
          return;
        }

        const payload = { name, startDate, dateFormat: DATE_FORMAT, locale: LOCALE };

        if (isEdit) await api.taxGroups.update(taxId, payload);
        else        await api.taxGroups.create(payload);
      }
      el.remove();
      toast('success', isEdit ? 'Tax updated' : 'Tax created', '');
      onSuccess();
    } catch (e) { toast('error', isEdit ? 'Update failed' : 'Create failed', e.detail?.defaultUserMessage || e.message); }
  });
}

export async function openDelinquencyModal(bucketId, onSuccess) {
  const isEdit = !!bucketId;
  let existing = {};
  let existingRanges = [];

  if (isEdit) {
    try {
      existing = await api.delinquencyBuckets.get(bucketId);
      const allRanges = await api.delinquencyBuckets.ranges();
      existingRanges = (Array.isArray(allRanges) ? allRanges : [])
        .filter(r => r.delinquencyBucketId === parseInt(bucketId));
    } catch {}
  }

  const rangeRow = (r = {}) => `
    <div class="dlq-range form-grid" style="margin-bottom:8px" ${r.id ? `data-range-id="${r.id}"` : ''}>
      <label>Classification * <input class="form-control dlq-class" value="${escapeHtml(r.classification || '')}" required/></label>
      <label>Min age (days) * <input type="number" class="form-control dlq-min" value="${r.minimumAgeDays ?? ''}" required/></label>
      <label>Max age (days) <input type="number" class="form-control dlq-max" value="${r.maximumAgeDays ?? ''}"/></label>
      <button type="button" class="btn-mini btn-danger dlq-remove">Remove</button>
    </div>`;

  const initialRangesHtml = existingRanges.length
    ? existingRanges.map(r => rangeRow(r)).join('')
    : rangeRow();

  const mid = 'dlq-modal-' + Date.now();
  const el = modal(mid, isEdit ? 'Edit Delinquency Bucket' : 'New Delinquency Bucket', `
    <label>Bucket name * <input id="dlq-name" class="form-control" value="${escapeHtml(existing.name || '')}" required/></label>

    <h4 class="mt-3">Delinquency Ranges</h4>
    ${isEdit ? `<div class="msg-banner b-info mb-2">
      <i class="fa-solid fa-circle-info"></i>
      Existing ranges are pre-filled. Add new rows below to create additional ranges. Remove rows to mark for deletion.
    </div>` : ''}
    <div id="dlq-ranges">${initialRangesHtml}</div>
    <button class="btn-secondary btn-sm mt-2" id="dlq-add-range"><i class="fa-solid fa-plus"></i> Add Range</button>`);

  const wireRemove = () => {
    el.querySelectorAll('.dlq-remove').forEach(b => {
      if (!b.dataset.wired) {
        b.dataset.wired = '1';
        b.addEventListener('click', () => b.closest('.dlq-range').remove());
      }
    });
  };
  wireRemove();

  el.querySelector('#dlq-add-range').addEventListener('click', () => {
    el.querySelector('#dlq-ranges').insertAdjacentHTML('beforeend', rangeRow());
    wireRemove();
  });

  el.querySelector('#' + mid + '-save').addEventListener('click', async () => {
    const name = v(el, 'dlq-name');
    if (!name) { toast('warn', 'Enter a bucket name', ''); return; }

    const rangesInForm = [...el.querySelectorAll('.dlq-range')].map(row => ({
      _existingId: row.dataset.rangeId ? parseInt(row.dataset.rangeId) : null,
      classification: row.querySelector('.dlq-class').value.trim(),
      minimumAgeDays: parseInt(row.querySelector('.dlq-min').value) || 0,
      maximumAgeDays: row.querySelector('.dlq-max').value
        ? parseInt(row.querySelector('.dlq-max').value)
        : undefined
    })).filter(r => r.classification);

    try {
      let workingBucketId;

      if (isEdit) {
        // Update bucket name
        await api.delinquencyBuckets.update(bucketId, { name });
        workingBucketId = parseInt(bucketId);

        // Reconcile ranges: delete removed, update existing, create new
        const formExistingIds = new Set(rangesInForm.filter(r => r._existingId).map(r => r._existingId));
        const removedRanges = existingRanges.filter(er => !formExistingIds.has(er.id));

        for (const er of removedRanges) {
          try { await api.delinquencyBuckets.deleteRange(er.id); } catch {}
        }
        for (const r of rangesInForm) {
          const body = {
            classification: r.classification,
            minimumAgeDays: r.minimumAgeDays,
            maximumAgeDays: r.maximumAgeDays,
            delinquencyBucketId: workingBucketId
          };
          if (r._existingId) {
            try { await api.delinquencyBuckets.updateRange(r._existingId, body); } catch {}
          } else {
            try { await api.delinquencyBuckets.createRange(body); } catch {}
          }
        }
      } else {
        // Create bucket then create ranges
        const created = await api.delinquencyBuckets.create({ name });
        workingBucketId = created.resourceId || created.id;
        await Promise.all(rangesInForm.map(r =>
          api.delinquencyBuckets.createRange({
            classification: r.classification,
            minimumAgeDays: r.minimumAgeDays,
            maximumAgeDays: r.maximumAgeDays,
            delinquencyBucketId: workingBucketId
          })
        ));
      }

      el.remove();
      toast('success', isEdit ? 'Delinquency bucket updated' : 'Delinquency bucket created', name);
      onSuccess();
    } catch (e) {
      toast('error', isEdit ? 'Update failed' : 'Create failed', e.detail?.defaultUserMessage || e.message);
    }
  });
}

export async function openProductMixModal(loanProductId, onSuccess) {
  const isEdit = !!loanProductId;

  // Fetch all loan products to populate pickers
  let allProducts = [];
  try {
    const r = await api.loanProducts.list();
    allProducts = Array.isArray(r) ? r : [];
  } catch {}

  let primaryProduct = null;
  let restrictedIds = new Set();

  if (isEdit) {
    primaryProduct = allProducts.find(p => p.id === parseInt(loanProductId));
    try {
      const mix = await api.productMix.get(loanProductId);
      const restricted = mix?.restrictedProducts || mix?.productMixes || [];
      restrictedIds = new Set(restricted.map(rp => rp.restrictedProductId || rp.id));
    } catch {}
  }

  // Build select options (exclude primary product from restricted list)
  const restrictableOptions = allProducts
    .filter(p => !primaryProduct || p.id !== primaryProduct.id)
    .map(p => `
      <label class="checkbox-row" style="display:block; padding:6px 0">
        <input type="checkbox" class="mix-restrict" value="${p.id}" ${restrictedIds.has(p.id) ? 'checked' : ''}/>
        ${escapeHtml(p.name)} <span class="text-muted small">(${escapeHtml(p.shortName || '')})</span>
      </label>`).join('');

  const primaryPicker = isEdit
    ? `<input class="form-control" value="${escapeHtml(primaryProduct?.name || '')}" disabled/>`
    : `<select id="mix-primary" class="form-control" required>
         <option value="">Select…</option>
         ${allProducts.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
       </select>`;

  const mid = 'mix-modal-' + Date.now();
  const el = modal(mid, isEdit ? 'Edit Product Mix' : 'New Product Mix', `
    <div class="msg-banner b-info mb-2">
      <i class="fa-solid fa-circle-info"></i>
      A product mix defines which other loan products a client cannot hold simultaneously with the primary product.
    </div>

    <label>Primary Loan Product *</label>
    ${primaryPicker}

    <h4 class="mt-3">Restricted Products</h4>
    <div class="text-muted small mb-2">Check products that cannot coexist with the primary product on the same client.</div>
    <div id="mix-restricted-list" style="max-height:300px; overflow:auto; border:1px solid var(--border); padding:8px; border-radius:4px">
      ${restrictableOptions || '<div class="text-muted">No other loan products available</div>'}
    </div>`, true);

  el.querySelector('#' + mid + '-save').addEventListener('click', async () => {
    const primaryId = isEdit ? parseInt(loanProductId) : vi(el, 'mix-primary');
    if (!primaryId) { toast('warn', 'Select primary product', ''); return; }

    const checked = [...el.querySelectorAll('.mix-restrict:checked')].map(cb => parseInt(cb.value));

    try {
      // Fineract product-mix payload uses `restrictedProducts: [id, id, ...]`
      const payload = { restrictedProducts: checked };
      if (isEdit) await api.productMix.update(primaryId, payload);
      else        await api.productMix.create(primaryId, payload);
      el.remove();
      toast('success', isEdit ? 'Product mix updated' : 'Product mix created', '');
      onSuccess();
    } catch (e) { toast('error', 'Save failed', e.detail?.defaultUserMessage || e.message); }
  });
}
