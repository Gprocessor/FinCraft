/* FinCraft · pages/products/actions/rates.js — standalone Rate entity modal (RateApiResource, /v1/rates).
   Was previously entirely unimplemented — see fixlogs/FIXLOG-api-audit.md, "Not touched in this pass"
   section ("the standalone Rate entity ... entirely unimplemented"). Distinct from Floating Rate
   (loan-products.js) — this is the simple named-percentage rate used elsewhere in Fineract
   (e.g. attached to charges/products), not a lending base-rate with time-boxed periods. */

import { LOCALE, DATE_FORMAT } from '../../../config.js';
import { api } from '../../../api.js';
import { escapeHtml } from '../../../utils.js';
import { modal, v, vb, vf } from '../shared.js';
import { toast } from '../../../ui.js';

import { extractFineractError } from '../../../ui/dom-helpers.js';
export async function openRateModal(rateId, onSuccess) {
  const isEdit = !!rateId;
  let existing = {};
  if (isEdit) {
    try { existing = await api.rates.get(rateId); } catch {}
  }

  const mid = 'rate-modal-' + Date.now();
  const el = modal(mid, isEdit ? 'Edit Rate' : 'New Rate', `
    <div class="form-grid">
      <label>Rate name * <input id="rt-name" class="form-control" value="${escapeHtml(existing.name || '')}" required/></label>
      <label>Percentage (%) * <input type="number" step="0.0001" id="rt-percentage" class="form-control" value="${existing.percentage ?? ''}" required/></label>
      <label class="checkbox-row"><input type="checkbox" id="rt-active" ${existing.active !== false ? 'checked' : ''}/> Active</label>
    </div>`);

  el.querySelector('#' + mid + '-save').addEventListener('click', async () => {
    const name = v(el, 'rt-name');
    const percentage = vf(el, 'rt-percentage');
    if (!name) { toast('warn', 'Enter a rate name', ''); return; }
    if (percentage === null) { toast('warn', 'Enter a percentage', ''); return; }

    const payload = {
      name,
      percentage,
      active: vb(el, 'rt-active'),
      locale: LOCALE,
      dateFormat: DATE_FORMAT
    };

    try {
      if (isEdit) await api.rates.update(rateId, payload);
      else        await api.rates.create(payload);
      el.remove();
      toast('success', isEdit ? 'Rate updated' : 'Rate created', name);
      onSuccess();
    } catch (e) { toast('error', isEdit ? 'Update failed' : 'Create failed', extractFineractError(e)); }
  });
}
