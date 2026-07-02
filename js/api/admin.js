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
    list: () => self._g('/permissions'),
    update: (b) => self._u('/permissions', b)
  };
}

export function makeJobsAPI(self) {
  return {
    list:    ()        => self._g('/jobs'),
    get:     (id)      => self._g(`/jobs/${id}`),
    update:  (id, b)   => self._u(`/jobs/${id}`, b),
    runJob:  (id)      => self._p(`/jobs/${id}?command=executeJob`, {}),
    history: (id, params) => self._g(`/jobs/${id}/runhistory`, params),
    schedule:(id, b)   => self._u(`/jobs/${id}/schedulername`, b)
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
    list:    (params) => self._g('/makercheckertasks', params),
    template:()       => self._g('/makercheckertasks/searchtemplate'),
    approve: (id)     => self._p(`/makercheckertasks/${id}?command=approve`, {}),
    reject:  (id)     => self._p(`/makercheckertasks/${id}?command=reject`, {}),
    delete:  (id)     => self._p(`/makercheckertasks/${id}?command=delete`, {})
  };
}

export function makeMakerCheckerTasksAPI(self) {
  return {
    list:   () => self._g('/makercheckerpermissions'),
    update: (body) => self._u('/makercheckerpermissions', body)
  };
}

export function makeConfigurationsAPI(self) {
  return {
    list:        ()         => self._g('/configurations'),
    get:         (name)     => self._g('/configurations', { name }),
    getById:     (id)       => self._g(`/configurations/${id}`),
    update:      (id, body) => self._u(`/configurations/${id}`, body),
    cache:       ()         => self._g('/configurations/cache'),
    updateCache: (b)        => self._u('/configurations/cache', b),
    cacheTypes:  ()         => self._g('/caches'),
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
    template:   () => self._g('/surveys/template'),
    create:     (body) => self._p('/surveys', body),
    update:     (id, b) => self._u(`/surveys/${id}`, b),
    delete:     (id) => self._d(`/surveys/${id}`),
    activate:   (id) => self._p(`/surveys/${id}?command=activate`, {}),
    deactivate: (id) => self._p(`/surveys/${id}?command=deactivate`, {})
  };
}

export function makeEntityToEntityMappingsAPI(self) {
  return {
    list:     ()                  => self._g('/entitytoentitymapping'),
    get:      (mappingTypeId)     => self._g(`/entitytoentitymapping/${mappingTypeId}`),
    update:   (mappingTypeId, b)  => self._u(`/entitytoentitymapping/${mappingTypeId}`, b)
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
