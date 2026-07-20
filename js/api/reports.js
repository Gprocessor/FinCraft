/* FinCraft · api/reports.js — Pentaho/Jasper reports, ad-hoc queries, entity datatable checks, and custom datatables.
   Auto-split from the original monolithic api.js for maintainability. */

export function makeReportsAPI(self) {
  return {
    list:   ()  => self._g('/reports'),
    get:    (id) => self._g(`/reports/${id}`),
    create: (b) => self._p('/reports', b),
    update: (id, b) => self._u(`/reports/${id}`, b),
    delete: (id) => self._d(`/reports/${id}`)
  };
}

export function makeRunReportsAPI(self) {
  return {
    // NOTE: passing parameterType=true returns the report's *parameter definitions*
    // (dropdown options etc), not actual report data — must be omitted to get real rows.
    run: (name, params, opts) => self._g(`/runreports/${encodeURIComponent(name)}`,
                                   { 'output-type': 'JSON', ...params }, opts),
    availableExports: (name) => self._g(`/runreports/availableExports/${encodeURIComponent(name)}`)
  };
}

export function makeCollectionSheetAPI(self) {
  return {
  // FIXLOG #1: CollectionSheetApiResource#generateCollectionSheet is POST-only (per
  // fineract_api_raw.json — the class exposes exactly one method, POST "", with the
  // saveCollectionSheet command dispatched off the same endpoint below). This was
  // previously firing as a GET, which Fineract has no route for (405/404) — the
  // "Load Sheet" button on the Collections page could never have worked. officeId/
  // staffId/meetingDate/etc. are query params on Fineract's side, so they still go
  // in as `params`; the body is the empty JSON object Fineract expects for this call.
  get:  (params) => self._p('/collectionsheet', {}, { params }),
  save: (body)   => self._p('/collectionsheet?command=saveCollectionSheet', body)
};
}

export function makeAdhocQueriesAPI(self) {
  return {
    list:    () => self._g('/adhocquery'),
    template:() => self._g('/adhocquery/template'),
    get:     (id) => self._g(`/adhocquery/${id}`),
    create:  (b) => self._p('/adhocquery', b),
    update:  (id, b) => self._u(`/adhocquery/${id}`, b),
    delete:  (id) => self._d(`/adhocquery/${id}`),
    runAll:  () => self._p('/adhocquery?command=execute', {})
  };
}

export function makeEntityDatatableChecksAPI(self) {
  return {
    list:     (params) => self._g('/entityDatatableChecks', params),
    template: ()       => self._g('/entityDatatableChecks/template'),
    create:   (body)   => self._p('/entityDatatableChecks', body),
    delete:   (id)     => self._d(`/entityDatatableChecks/${id}`)
  };
}

export function makeDataTablesAPI(self) {
  return {
      list:       ()                  => self._g('/datatables'),
      get:        (name)              => self._g(`/datatables/${name}`),
      register:   (name, app, body)   => self._p(`/datatables/register/${name}/${app}`, body),
      deregister: (name)              => self._p(`/datatables/deregister/${name}`, {}),
      // Retrieves the datatable row(s) for a given app-table entity id
      // (e.g. all rows of a client-scoped datatable for clientId=42).
      query:      (name, entityId)    => self._g(`/datatables/${name}/${entityId}`),
      create:     (body)              => self._p('/datatables', body),
      updateSchema:(name, body)       => self._u(`/datatables/${name}`, body),   // ← NEW: add/change/drop columns
      update:     (name, eid, body)   => self._u(`/datatables/${name}/${eid}`, body),
      delete:     (name, eid)         => self._d(`/datatables/${name}/${eid}`),
      deleteTable:(name)              => self._d(`/datatables/${name}`),

      // ---- Entry CRUD (was entirely missing — schema management existed but
      // there was no way to create/read/update/delete an actual data row) ----
      createEntry: (name, entityId, body) => self._p(`/datatables/${name}/${entityId}`, body),
      // One-to-many datatables (multiple rows per entity) are addressed by a
      // second id, datatableId, identifying the specific row.
      getEntry:    (name, entityId, datatableId) => self._g(`/datatables/${name}/${entityId}/${datatableId}`),
      updateEntryOneToMany: (name, entityId, datatableId, body) => self._u(`/datatables/${name}/${entityId}/${datatableId}`, body),
      deleteEntry: (name, entityId, datatableId) => self._d(`/datatables/${name}/${entityId}/${datatableId}`),

      // ---- Advanced query (distinct from the entity-scoped `query` above —
      // this is Fineract's column/where-clause query feature) ----
      advancedQuery:     (name, params) => self._g(`/datatables/${name}/query`, params),
      advancedQueryPost: (name, body)   => self._p(`/datatables/${name}/query`, body)
    };
}
