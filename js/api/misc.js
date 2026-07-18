/* FinCraft · api/misc.js — Charges, document templates, self-service portal, global search, batch requests, documents/images/notes, account transfers, standing instructions, COB, and bulk imports.
   Auto-split from the original monolithic api.js for maintainability. */

export function makeChargesAPI(self) {
  return {
    list:   (params) => self._g('/charges', params),
    get:    (id)     => self._g(`/charges/${id}`),
    template:()      => self._g('/charges/template'),
    create: (body)   => self._p('/charges', body),
    update: (id, b)  => self._u(`/charges/${id}`, b),
    delete: (id)     => self._d(`/charges/${id}`)
  };
}

export function makeTemplatesAPI(self) {
  return {
    list:           ()       => self._g('/templates'),
    get:            (id)     => self._g(`/templates/${id}`),
    template:       ()       => self._g('/templates/template'),
    templateForEdit:(id)     => self._g(`/templates/${id}/template`),
    create:         (body)   => self._p('/templates', body),
    update:         (id, b)  => self._u(`/templates/${id}`, b),
    delete:         (id)     => self._d(`/templates/${id}`),
    // Preview/merge: POST /templates/{id} (no command needed in newer versions)
    preview:        (id, body) => self._p(`/templates/${id}`, body || {})
  };
}

export function makeSelfServiceAPI(self) {
  return {
    users:        ()      => self._g('/self/userdetails'),
    register:     (body)  => self._p('/self/registration', body),
    activate:     (body)  => self._p('/self/registration/user', body),
    resetPassword:(body)  => self._p('/self/registration/resetpassword', body),
    beneficiaries:()      => self._g('/self/beneficiaries/tpt'),
    addBeneficiary:(body) => self._p('/self/beneficiaries/tpt', body),
    updateBeneficiary:(id, b) => self._u(`/self/beneficiaries/tpt/${id}`, b),
    deleteBeneficiary:(id) => self._d(`/self/beneficiaries/tpt/${id}`)
  };
}

export function makeSearchAPI(self) {
  return {
    search: (query, resource = 'clients,loans,groups') =>
      self._g('/search', { query, resource }),
    advanced: (body) => self._p('/search/advance', body)
  };
}

export function makeBatchAPI(self) {
  return {
    submit: (requests, enclosingTransaction = false) => {
      const payload = requests.map(r => ({
        requestId: r.requestId,
        relativeUrl: r.relativeUrl,
        method: r.method,
        headers: [{ name: 'Content-Type', value: 'application/json' }],
        ...(r.body !== undefined ? { body: JSON.stringify(r.body) } : {})
      }));
      return self._req('POST', '/batches', {
        params: enclosingTransaction ? { enclosingTransaction: 'true' } : undefined,
        body: payload
      }).then(results => (Array.isArray(results) ? results : []).map(r => ({
        ...r,
        ok: r.statusCode >= 200 && r.statusCode < 300,
        body: (() => { try { return JSON.parse(r.body); } catch { return r.body; } })()
      })));
    }
  };
}

export function makeDocumentsAPI(self) {
  return {
    list:     (entityType, entityId)             => self._g(`/${entityType}/${entityId}/documents`),
    get:      (entityType, entityId, docId)       => self._g(`/${entityType}/${entityId}/documents/${docId}`),
    download: (entityType, entityId, docId)       => self._req('GET', `/${entityType}/${entityId}/documents/${docId}/attachment`, { raw: true }),
    upload:   (entityType, entityId, formData)    => self._req('POST', `/${entityType}/${entityId}/documents`, { body: formData }),
    update:   (entityType, entityId, docId, formData) => self._req('PUT', `/${entityType}/${entityId}/documents/${docId}`, { body: formData }),
    delete:   (entityType, entityId, docId)       => self._d(`/${entityType}/${entityId}/documents/${docId}`)
  };
}

export function makeImagesAPI(self) {
  return {
    get:    (entityType, entityId) => self._req('GET', `/${entityType}/${entityId}/images`, { raw: true }),
    upload: (entityType, entityId, formData) => self._req('POST', `/${entityType}/${entityId}/images`, { body: formData }),
    delete: (entityType, entityId) => self._d(`/${entityType}/${entityId}/images`)
  };
}

export function makeNotesAPI(self) {
  return {
    list:   (entityType, entityId)         => self._g(`/${entityType}/${entityId}/notes`),
    get:    (entityType, entityId, noteId) => self._g(`/${entityType}/${entityId}/notes/${noteId}`),
    create: (entityType, entityId, body)   => self._p(`/${entityType}/${entityId}/notes`, body),
    update: (entityType, entityId, noteId, body) => self._u(`/${entityType}/${entityId}/notes/${noteId}`, body),
    delete: (entityType, entityId, noteId) => self._d(`/${entityType}/${entityId}/notes/${noteId}`)
  };
}

export function makeTransfersAPI(self) {
  return {
    list:    (params) => self._g('/accounttransfers', params),
    create:  (body)   => self._p('/accounttransfers', body),
    refund:  (body)   => self._p('/accounttransfers/refundByTransfer', body),
    refundTemplate: (params) => self._g('/accounttransfers/templateRefundByTransfer', params),
    template:(params) => self._g('/accounttransfers/template', params),
    get:     (id)     => self._g(`/accounttransfers/${id}`),
    // "Operation on active account transfer" — the doc doesn't spell out what
    // operations exist (only the bare path + a generic summary), so this is a
    // thin pass-through; the caller supplies whatever command/body Fineract expects.
    operate: (id, body) => self._p(`/accounttransfers/${id}`, body)
  };
}

export function makeStandingInstructionsAPI(self) {
  return {
    list:    (params)  => self._g('/standinginstructions', params),
    get:     (id)      => self._g(`/standinginstructions/${id}`),
    template:(params)  => self._g('/standinginstructions/template', params),
    create:  (body)    => self._p('/standinginstructions', body),
    update:  (id, b)   => self._u(`/standinginstructions/${id}`, b),
    // No delete() — StandingInstructionApiResource exposes template/create/update/retrieveAll/retrieveOne only,
    // no DELETE, per Fineract source (confirmed even though DELETE_STANDINGINSTRUCTION is a real permission code).
    history: (params)  => self._g('/standinginstructionrunhistory', params)
  };
}

export function makeCobAPI(self) {
  return {
    configurations: () => self._g('/cob-configurations'),
    updateConfig:   (id, body) => self._u(`/cob-configurations/${id}`, body),
    businessDate: {
      get: () => self._g('/businessdate'),
      getByType: (type) => self._g(`/businessdate/${type}`),
      // NOTE: Fineract_Backend_API_Reference.md documents this as POST, not PUT
      // (existing code previously used self._u/PUT — corrected to match the doc).
      // Flagging this as a behavior change, not a net-new addition.
      set: (body) => self._p('/businessdate', body)
    },
    catchUp: () => self._p('/loans/catch-up-processing', {})
  };
}

export function makeBulkImportsAPI(self) {
  return {
      // IMPORTANT: this endpoint streams a binary .xlsx file, not JSON. Without `raw: true`,
      // core.js's default response handling falls through to `r.text()` for any non-JSON
      // content-type, which decodes the binary workbook bytes as UTF-8 text and corrupts them —
      // the resulting Blob is an unreadable/broken "template" file (this was the download bug).
      // Every other binary-download call in the app (reports, document attachments, images)
      // uses this same `raw: true` + `res.blob()` pattern — see js/ui/handlers/run-report.js.
      // `params` is optional and forwarded as-is (e.g. officeId) — many Fineract `*/template`
      // endpoints across this API accept officeId to scope the dropdown data embedded in the
      // sheet (see clients/template, groups/template, centers/template, etc. in the API docs);
      // an unrecognized query param is simply ignored server-side, so passing it is always safe.
      template: (entity, params)   => self._req('GET', `/${entity}/downloadtemplate`, { params, raw: true }),
      upload:   (entity, formData) => self._req('POST', `/${entity}/uploadtemplate`, { body: formData, headers: {} }),
      // ---- Generic /imports endpoint ----
      // BulkImportApiResource has exactly 3 real methods: bare GET /v1/imports (list, filterable
      // via params), GET getOutputTemplateLocation, and GET downloadOutputTemplate.
      //
      // CORRECTION (see fixlogs/FIXLOG-bulk-import.md): a previous pass here assumed neither
      // output-template method takes a per-import id and removed the per-row download button.
      // That assumption was wrong. Apache Fineract JIRA FINERACT-2121 ("Importer error - Postgres
      // syntax") shows the real query behind this exact code path:
      //   select d.location, d.file_name from m_import_document i
      //   inner join m_document d on i.document_id = d.id where i.id = ?
      // — i.e. both endpoints DO take the import row's id (as `importDocumentId`), used to look
      // up the output/error report generated for that specific import job. That's the "export"
      // half of bulk import/export: upload a sheet in, download the processed/annotated sheet
      // (with per-row success/failure + error messages) back out. See outputTemplate() below.
      list:     (params)             => self._g('/imports', params),
      // getOutputTemplateLocation returns a server-side filesystem path string, not a fetchable
      // resource — not useful to a browser client, so it isn't wired to any UI action, but the
      // pass-through is kept here for API completeness/parity with the documented resource.
      outputTemplateLocation: (importDocumentId) => self._g('/imports/getOutputTemplateLocation', { importDocumentId }),
      // The actual downloadable artifact: streams the processed workbook (annotated with
      // per-row status/errors) for a given import job. Binary — same raw:true + blob() pattern
      // as template() above.
      outputTemplate: (importDocumentId) => self._req('GET', '/imports/downloadOutputTemplate', { params: { importDocumentId }, raw: true })
    };
}
