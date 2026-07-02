/* FinCraft · api/integrations.js — Notifications, webhooks, external services/events, and SMS campaigns.
   Auto-split from the original monolithic api.js for maintainability. */

export function makeNotificationsAPI(self) {
  return {
    list:        (params) => self._g('/notifications', params),
    get:         (id)     => self._g(`/notifications/${id}`),
    markRead:    (id)     => self._u(`/notifications/${id}`, { isRead: true }),
    markAllRead: ()       => self._u('/notifications', { isRead: true })
  };
}

export function makeHooksAPI(self) {
  return {
    list:    ()        => self._g('/hooks'),
    get:     (id)      => self._g(`/hooks/${id}`),
    template:()        => self._g('/hooks/template'),
    create:  (b)       => self._p('/hooks', b),
    update:  (id, b)   => self._u(`/hooks/${id}`, b),
    delete:  (id)      => self._d(`/hooks/${id}`)
  };
}

export function makeExternalServicesAPI(self) {
  return {
    sms:         { list: () => self._g('/externalservice/SMS'),         update: (b) => self._u('/externalservice/SMS', b) },
    email:       { list: () => self._g('/externalservice/SMTP'),        update: (b) => self._u('/externalservice/SMTP', b) },
    smtpEmail:   { list: () => self._g('/externalservice/SMTP'),        update: (b) => self._u('/externalservice/SMTP', b) },
    s3:          { list: () => self._g('/externalservice/S3'),          update: (b) => self._u('/externalservice/S3', b) },
    notification:{ list: () => self._g('/externalservice/NOTIFICATION'),update: (b) => self._u('/externalservice/NOTIFICATION', b) }
  };
}

export function makeExternalEventsAPI(self) {
  return {
    list:           (params) => self._g('/externalevents', params),
    get:            (id)     => self._g(`/externalevents/${id}`),
    configurations: ()       => self._g('/externalevents/configuration'),
    updateConfig:   (b)      => self._u('/externalevents/configuration', b)
  };
}

export function makeSmsCampaignsAPI(self) {
  return {
    list: () => self._g('/smscampaigns'),
    get: (id) => self._g(`/smscampaigns/${id}`),
    template: () => self._g('/smscampaigns/template'),
    create: (b) => self._p('/smscampaigns', b),
    update: (id, b) => self._u(`/smscampaigns/${id}`, b),
    delete: (id) => self._d(`/smscampaigns/${id}`),
    activate: (id) => self._p(`/smscampaigns/${id}?command=activate`, {}),
    close: (id) => self._p(`/smscampaigns/${id}?command=close`, {}),
    reactivate: (id) => self._p(`/smscampaigns/${id}?command=reactivate`, {})
  };
}
