# Keycloak setup — status and next steps

Migrating FinCraft's login from Fineract's Basic Auth to OAuth2/OIDC via
Keycloak, so a future Android app (and any other client) can share one real
identity provider instead of each reinventing auth.

## Multi-tenant: confirmed, requires one realm per tenant

Your tenants are fully isolated Postgres databases, each with its own
`m_appuser` table. A single shared Keycloak realm would need every username
to stay globally unique across every tenant forever, with no way for
Keycloak to tell two different institutions' same-named users apart.

**Decision: one Keycloak realm per Fineract tenant**, named identically to
the tenant identifier. This mirrors the exact isolation model your Postgres
tenancy already uses, and means the frontend can derive the right realm
straight from the same domain→tenant mapping it already resolves via
`TENANT_DOMAINS` — no new mapping table needed.

`deploy/create-keycloak-realm.sh <tenant_identifier>` creates a realm +
a `fincraft-web` client (direct-access-grants enabled, for the ROPC
username/password flow) via Keycloak's Admin REST API. It's now wired into
`add-tenant.sh` automatically — every new tenant gets a matching realm for
free, gracefully skipped if Keycloak isn't configured on this deployment.

## Private repo: already fully supported, nothing to add

Checked `setup-deploy-key.sh` and the watcher logic in `setup-vm.sh` — this
was already built correctly. When you're ready: make the repo Private on
GitHub, run `./setup-deploy-key.sh`, add the printed public key as a
**read-only** Deploy Key on the repo, set `REPO_PRIVATE=true` in `.env`,
re-run `./setup-vm.sh`. Full steps in `PRIVATE-REPO.md`.

## Confirmed via isolated testing (deploy/oauth-test/)

- `apache/fineract:latest` (standard image, no rebuild) genuinely supports
  OAuth2 **resource server** mode via env vars
  (`FINERACT_SECURITY_OAUTH_ENABLED=true`,
  `FINERACT_SECURITY_BASICAUTH_ENABLED=false`) — proven via a real boot
  test returning `401` with `WWW-Authenticate: Bearer` (not `Basic`).
- No built-in token-issuing authorization server —
  `/.well-known/openid-configuration` returned `404`. Confirms Keycloak (or
  similar) is required to actually issue tokens.
- The env var to point Fineract's resource-server trust at Keycloak,
  `SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_ISSUER_URI`, is the standard
  Spring Boot property name (Fineract is a standard Spring Boot + Spring
  Security app) — a well-grounded inference, but not confirmed against
  Fineract's own docs (couldn't find one covering it specifically).
  `deploy/oauth-test/` now has a phase-2 test that proves this one way or
  the other: get a real token from a test Keycloak realm, use it against a
  real Fineract endpoint, see if it's accepted. **Run this before the
  production env var below is trusted.**

## Where things stand in the real deploy

- `keycloak` service added to `deploy/docker-compose.yml` — shares the
  existing Postgres (own `keycloak` role + database), bound to
  `127.0.0.1:8080` only. Not reachable from outside the VM, not wired into
  nginx yet.
- `deploy/init-db/02-init-keycloak.sh` added for *future* fresh deploys.
- `deploy/create-keycloak-realm.sh` + `add-tenant.sh` integration, as above.
- **Fineract's OAuth env vars are deliberately NOT set in production
  `docker-compose.yml` yet.** Flipping `FINERACT_SECURITY_OAUTH_ENABLED=true`
  without the matching frontend rewrite (still Basic Auth in `js/auth.js`)
  would break login for every current user immediately. Your live login is
  completely unaffected by anything in this doc so far.

## Next steps, in order

1. **Run the phase-2 test** in `deploy/oauth-test/` — confirms the
   `issuer-uri` inference before it goes near production. See that
   directory's `README.md`.
2. Once confirmed: add `SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_ISSUER_URI`
   (pointing at each tenant's realm — this itself is a wrinkle worth solving
   carefully for true multi-tenant support, since Fineract's resource-server
   config is typically one issuer per app instance, not one per request;
   may need per-tenant Fineract instances, or a Keycloak setup where all
   tenant realms share a common trusted issuer pattern — needs more research
   before committing to an approach) to production, still with
   `FINERACT_SECURITY_OAUTH_ENABLED=false` — proving the config is correct
   without yet cutting over.
3. Rewrite `js/auth.js`'s login flow to get a token from Keycloak instead of
   POSTing to Fineract's own `/authentication`, and switch every subsequent
   API call from Basic Auth to `Authorization: Bearer`. This is the biggest
   remaining piece — a full rewrite of the app's auth layer, not a small
   patch, and needs its own careful pass.
4. Only once 1-3 are done and verified: flip
   `FINERACT_SECURITY_OAUTH_ENABLED=true` /
   `FINERACT_SECURITY_BASICAUTH_ENABLED=false` in production and cut over
   for real.
5. Register a second Keycloak client per realm for the future Android app,
   using Authorization Code + PKCE (not the password grant the web client
   uses) — current best practice for native mobile clients.

Each step verified before moving to the next, same approach as everything
else in this project.
