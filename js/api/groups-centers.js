/* FinCraft · api/groups-centers.js — Groups, centers, and the calendars/meetings shared across group-based entities.
   Auto-split from the original monolithic api.js for maintainability. */

export function makeGroupsAPI(self) {
  return {
    list:           (params)   => self._g('/groups', params),
    get:            (id, p)    => self._g(`/groups/${id}`, p),
    template:       (params)   => self._g('/groups/template', params),
    create:         (body)     => self._p('/groups', body),
    update:         (id, body) => self._u(`/groups/${id}`, body),
    activate:       (id, body) => self._p(`/groups/${id}?command=activate`, body),
    close:          (id, body) => self._p(`/groups/${id}?command=close`, body),
    assignStaff:    (id, body) => self._p(`/groups/${id}?command=assignStaff`, body),
    // Fineract's reference doc lists two ways to reach this action: a dedicated
    // /groups/{groupId}/command/unassign_staff sub-path, and the same
    // ?command=unassignStaff dispatch already used for every other group command
    // (see the shared-command row in the doc). Keeping the original, already-working
    // ?command= form rather than swapping to the alternate path on unverified footing.
    unassignStaff:  (id, body) => self._p(`/groups/${id}?command=unassignStaff`, body || {}),
    assignRole:     (id, body) => self._p(`/groups/${id}?command=assignRole`, body),
    updateRole:     (id, rid, body) => self._p(`/groups/${id}?command=updateRole&roleId=${rid}`, body),
    unassignRole:   (id, rid)  => self._p(`/groups/${id}?command=unassignRole&roleId=${rid}`, {}),
    associateClients:    (id, body) => self._p(`/groups/${id}?command=associateClients`, body),
    disassociateClients: (id, body) => self._p(`/groups/${id}?command=disassociateClients`, body),
    transferClients:     (id, body) => self._p(`/groups/${id}?command=transferClients`, body),
    generateCollectionSheet: (id, body) => self._p(`/groups/${id}?command=generateCollectionSheet`, body),
    saveCollectionSheet:     (id, body) => self._p(`/groups/${id}?command=saveCollectionSheet`, body),
    accounts:       (id)       => self._g(`/groups/${id}/accounts`),
    glimAccounts:   (id, parentLoanAccountNo) => self._g(`/groups/${id}/glimaccounts`, parentLoanAccountNo ? { parentLoanAccountNo } : undefined),
    gsimAccounts:   (id, params) => self._g(`/groups/${id}/gsimaccounts`, params),
    // NOTE: charges/, addCharge/, payCharge/, waiveCharge/, deleteCharge/ were
    // removed — GroupsApiResource has no /charges sub-path at all (confirmed
    // by reading its full @Path list). Apply charges to the group's
    // individual member clients (ClientChargesApiResource) instead.
    delete:         (id)       => self._d(`/groups/${id}`)
  };
}

export function makeCentersAPI(self) {
  return {
    list:     (params)     => self._g('/centers', params),
    get:      (id, params) => self._g(`/centers/${id}`, params),
    template: (params)     => self._g('/centers/template', params),       // ← now accepts officeId/staffId/command
    create:   (body)       => self._p('/centers', body),
    update:   (id, body)   => self._u(`/centers/${id}`, body),
    delete:   (id)         => self._d(`/centers/${id}`),
    activate: (id, body)   => self._p(`/centers/${id}?command=activate`, body),
    close:    (id, body)   => self._p(`/centers/${id}?command=close`, body),
    associateGroups:    (id, body) => self._p(`/centers/${id}?command=associateGroups`, body),
    disassociateGroups: (id, body) => self._p(`/centers/${id}?command=disassociateGroups`, body),
    generateCollectionSheet: (id, body) => self._p(`/centers/${id}?command=generateCollectionSheet`, body),
    saveCollectionSheet:     (id, body) => self._p(`/centers/${id}?command=saveCollectionSheet`, body),
    accounts: (id) => self._g(`/centers/${id}/accounts`)                  // ← added for symmetry with groups
  };
}

export function makeCalendarsAPI(self) {
  return {
    list:   (entityType, entityId, params) => self._g(`/${entityType}/${entityId}/calendars`, params),
    get:    (entityType, entityId, calendarId) => self._g(`/${entityType}/${entityId}/calendars/${calendarId}`),
    template: (entityType, entityId, params) => self._g(`/${entityType}/${entityId}/calendars/template`, params),
    create: (entityType, entityId, body)   => self._p(`/${entityType}/${entityId}/calendars`, body),
    update: (entityType, entityId, calendarId, body) => self._u(`/${entityType}/${entityId}/calendars/${calendarId}`, body),
    delete: (entityType, entityId, calendarId)       => self._d(`/${entityType}/${entityId}/calendars/${calendarId}`)
  };
}

export function makeMeetingsAPI(self) {
  return {
    list:   (entityType, entityId, params) => self._g(`/${entityType}/${entityId}/meetings`, params),
    get:    (entityType, entityId, meetingId) => self._g(`/${entityType}/${entityId}/meetings/${meetingId}`),
    template: (entityType, entityId, params) => self._g(`/${entityType}/${entityId}/meetings/template`, params),
    create: (entityType, entityId, body)   => self._p(`/${entityType}/${entityId}/meetings`, body),
    update: (entityType, entityId, meetingId, body) => self._u(`/${entityType}/${entityId}/meetings/${meetingId}`, body),
    delete: (entityType, entityId, meetingId)       => self._d(`/${entityType}/${entityId}/meetings/${meetingId}`),
    saveAttendance: (entityType, entityId, meetingId, body) =>
      self._p(`/${entityType}/${entityId}/meetings/${meetingId}?command=saveOrUpdateAttendance`, body)
  };
}

export function makeGroupLevelsAPI(self) {
  return {
    list: () => self._g('/grouplevels')
  };
}
