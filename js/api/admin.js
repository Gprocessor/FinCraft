/* FinCraft · api/admin.js — Users, roles, permissions, jobs/audits, maker-checker, system configuration, and surveys.
   Auto-split from the original monolithic api.js for maintainability. */

export function makeUsersAPI(self) {
  return {
    list:   ()       => self._g('/users'),
    get:    (id)     => self._g(`/users/${id}`),
    template:()      => self._g('/users/template'),
    create: (body)   => self._p('/users', body),
    update: (id, b)  => self._u(`/users/${id}`, b),
    delete: (id)     => self._d(`/users/${id}`)
  };
}

export function makeRolesAPI(self) {
  return {
    list:       ()         => self._g('/roles'),
    get:        (id)       => self._g(`/roles/${id}`),
    create:     (body)     => self._p('/roles', body),
    update:     (id, b)    => self._u(`/roles/${id}`, b),
    delete:     (id)       => self._d(`/roles/${id}`),
    enable:     (id)       => self._p(`/roles/${id}?command=enable`, {}),
    disable:    (id)       => self._p(`/roles/${id}?command=disable`, {}),
    permissions:(id)       => self._g(`/roles/${id}/permissions`),
    updatePermissions:(id, b) => self._u(`/roles/${id}/permissions`, b)
  };
}

export function makePermissionsAPI(self) {
  return {
    list: (makerCheckerable) => self._g('/permissions', makerCheckerable ? { makerCheckerable: true } : undefined),
    update: (b) => self._u('/permissions', b)
  };
}

export function makeJobsAPI(self) {
  return {
    list:    ()        => self._g('/jobs'),
    get:     (id)      => self._g(`/jobs/${id}`),
    update:  (id, b)   => self._u(`/jobs/${id}`, b),
    runJob:  (id)      => self._p(`/jobs/${id}?command=executeJob`, {}),
    history: (id, params) => self._g(`/jobs/${id}/runhistory`, params)
    // NOTE: there is no PUT /jobs/{id}/schedulername endpoint in Fineract —
    // schedulerName is an internal Quartz-scheduler detail, never exposed
    // over HTTP. A `schedule()` method calling that path used to live here;
    // it was removed since it always 404'd and nothing in the UI called it.
  };
}

export function makeAuditsAPI(self) {
  return {
    list:           (params) => self._g('/audits', params),
    get:            (id)     => self._g(`/audits/${id}`),
    searchTemplate: ()       => self._g('/audits/searchtemplate')
  };
}

export function makeMakercheckerAPI(self) {
  return {
    // Real Fineract resource is /v1/makercheckers (FinCraft was calling the
    // non-existent /makercheckertasks). Delete uses a real HTTP DELETE, not
    // POST ?command=delete.
    list:    (params) => self._g('/makercheckers', params),
    template:()       => self._g('/makercheckers/searchtemplate'),
    approve: (id)     => self._p(`/makercheckers/${id}?command=approve`, {}),
    reject:  (id)     => self._p(`/makercheckers/${id}?command=reject`, {}),
    delete:  (id)     => self._d(`/makercheckers/${id}`)
  };
}

// The maker-checker permissions toggle screen duplicated makePermissionsAPI
// with a fabricated /makercheckerpermissions endpoint that doesn't exist.
// The real capability is the existing PermissionsApiResource, filtered by
// the makerCheckerable query param — use api.permissions.list(true) /
// api.permissions.update() instead of this API going forward.

export function makeConfigurationsAPI(self) {
  return {
    list:        ()         => self._g('/configurations'),
    // NOTE: previously sent `name` as a query param to the list endpoint
    // (/configurations?name=X), which is not a real Fineract route. Corrected
    // to the documented /configurations/name/{name} path.
    get:         (name)     => self._g(`/configurations/name/${name}`),
    getById:     (id)       => self._g(`/configurations/${id}`),
    update:      (id, body) => self._u(`/configurations/${id}`, body),
    updateByName:(name, body) => self._u(`/configurations/name/${name}`, body),
    cache:       ()         => self._g('/configurations/cache'),
    updateCache: (b)        => self._u('/configurations/cache', b),
    cacheTypes:  ()         => self._g('/caches'),
    switchCache: (body)     => self._u('/caches', body),
    globalConfig: {
      list:   ()           => self._g('/configurations'),
      update: (id, body)   => self._u(`/configurations/${id}`, body)
    }
  };
}

export function makeSurveysAdminAPI(self) {
  return {
    list:       () => self._g('/surveys'),
    get:        (id) => self._g(`/surveys/${id}`),
    create:     (body) => self._p('/surveys', body),
    update:     (id, b) => self._u(`/surveys/${id}`, b),
    // No template() or delete() — SpmApiResource has no /surveys/template endpoint and no DELETE method at all.
    activate:   (id) => self._p(`/surveys/${id}?command=activate`, {}),
    deactivate: (id) => self._p(`/surveys/${id}?command=deactivate`, {})
  };
}

export function makeEntityToEntityMappingsAPI(self) {
  return {
    list:     ()                  => self._g('/entitytoentitymapping'),
    get:      (mappingTypeId)     => self._g(`/entitytoentitymapping/${mappingTypeId}`),
    // NOTE: the API reference gives no summary text or field names for any of
    // entitytoentitymapping's endpoints beyond the bare paths (mapId/relId/
    // fromId/toId are undocumented). These are added as thin, correctly-routed
    // pass-throughs only — no UI has been built against them since there's no
    // safe basis for guessing the request/response shape.
    getMapping: (mapId, fromId, toId) => self._g(`/entitytoentitymapping/${mapId}/${fromId}/${toId}`),
    create:     (relId, body)     => self._p(`/entitytoentitymapping/${relId}`, body),
    update:   (mappingTypeId, b)  => self._u(`/entitytoentitymapping/${mappingTypeId}`, b),
    delete:     (mapId)           => self._d(`/entitytoentitymapping/${mapId}`)
  };
}

export function makeAccountNumberPreferencesAPI(self) {
  return {
    list:     ()         => self._g('/accountnumberformats'),
    get:      (id)       => self._g(`/accountnumberformats/${id}`),
    template: ()         => self._g('/accountnumberformats/template'),
    create:   (body)     => self._p('/accountnumberformats', body),
    update:   (id, body) => self._u(`/accountnumberformats/${id}`, body),
    delete:   (id)       => self._d(`/accountnumberformats/${id}`)
  };
}
