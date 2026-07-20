# OAuth chain test — throwaway, not part of the real deploy

Phase 1 (done) answered: does `apache/fineract:latest` support OAuth2
resource-server mode via env vars? **Yes**, confirmed — no source rebuild
needed.

Phase 2 (this version) answers the remaining real question: **does Fineract
actually accept a token issued by Keycloak?** The `issuer-uri` env var name
(`SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_ISSUER_URI`) is a well-grounded
inference from Fineract being a standard Spring Boot + Spring Security app —
but it's still an inference, not something confirmed against Fineract's own
docs (couldn't find one covering this specific property). This test proves
it one way or the other before it goes anywhere near production.

## Run it

```
cd deploy/oauth-test
docker compose up
```

Watch the logs directly. Wait for both `fineract-oauth-test-keycloak` and
`fineract-oauth-test-server` to finish starting (same ~90s Fineract startup
as before).

## Set up a test realm and user (one-time, in a second terminal)

The realm named `default` (matching `FINERACT_DEFAULT_TENANTDB_IDENTIFIER`
in this test rig) doesn't exist yet — Keycloak starts empty.

```
# Get an admin token
ADMIN_TOKEN=$(curl -s -X POST "http://127.0.0.1:18080/realms/master/protocol/openid-connect/token" \
  -d "grant_type=password" -d "client_id=admin-cli" \
  -d "username=admin" -d "password=throwaway" | jq -r '.access_token')

# Create the realm
curl -s -X POST "http://127.0.0.1:18080/admin/realms" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"realm": "default", "enabled": true}'

# Create a client with direct access grants (the ROPC flow the web app uses)
curl -s -X POST "http://127.0.0.1:18080/admin/realms/default/clients" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"clientId": "fincraft-web", "publicClient": true, "directAccessGrantsEnabled": true, "standardFlowEnabled": false, "enabled": true}'

# Create a test user with a password
CLIENT_UUID=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://127.0.0.1:18080/admin/realms/default/clients?clientId=fincraft-web" | jq -r '.[0].id')
curl -s -X POST "http://127.0.0.1:18080/admin/realms/default/users" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"username": "testuser", "enabled": true, "credentials": [{"type": "password", "value": "testpass123", "temporary": false}]}'
```

## Get a token, then use it against Fineract

```
TOKEN=$(curl -s -X POST "http://127.0.0.1:18080/realms/default/protocol/openid-connect/token" \
  -d "grant_type=password" -d "client_id=fincraft-web" \
  -d "username=testuser" -d "password=testpass123" | jq -r '.access_token')

echo "$TOKEN"   # should be a long JWT, not null/empty — if it's empty, the Keycloak side failed, stop here

curl -k -i "https://localhost:18443/fineract-provider/api/v1/users" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Fineract-Platform-TenantId: default"
```

## What to look for

- **`200` with a JSON user list** → confirmed — Fineract genuinely accepts
  Keycloak-issued tokens with the `issuer-uri` env var as configured. This
  is the green light to move the same config into production and start on
  the frontend rewrite.
- **`401`** → the issuer trust isn't working as configured. Paste me the
  response body and the full Fineract log around the request — there's
  likely a different property name or an additional required setting
  (audience mapping is a common culprit — some Spring Boot setups need an
  explicit `aud` claim check configured on the Keycloak client side).
- **Anything else (500, connection refused, etc.)** → paste the output,
  we'll debug from there.

## Clean up when done

```
docker compose down -v
```

## Result (2026-07-13): chain fully verified, hit a real upstream Fineract bug

Ran this all the way through: real Keycloak realm/client/user, token
issuance confirmed correct (`iss` matching Fineract's issuer-uri exactly,
once `KC_HOSTNAME` used a full URL with explicit port — a bare hostname
alone doesn't fully pin it), then a real authenticated call against
Fineract using a Keycloak user matching Fineract's own seeded `mifos` admin.

Every piece of *our* configuration checked out. Fineract's own logs (pulled
via `docker logs fineract-oauth-test-server` right after a failing request —
the client-facing 401 gives nothing useful, the server log has everything)
showed the request reaching Fineract's real, dedicated
`FineractJwtAuthenticationTokenConverter` — proof Fineract has genuine
built-in support for this — then failing inside
`TenantAwareJpaPlatformUserDetailsService.loadUserByUsername()` with:

```
SpelEvaluationException: EL1011E: Method call: Attempted to call method
getTenantIdentifier() on null context object
```

Traced this to Fineract's own very-recent **FINERACT-1984 "OAuth2.1"**
work — brand new code, not the years-old documented OAuth path. Since this
rig (and production) pull `apache/fineract:latest`, tracking `develop`,
we've been testing genuinely bleeding-edge functionality with a real,
apparently-unpolished bug in it. See `../KEYCLOAK-SETUP.md` for the full
writeup and options going forward.

**Note for next time:** partway through this test, a code edit made in the
assistant's sandbox didn't automatically reach this VM — `git pull` showing
"Already up to date" was the tell. Zip output needs an explicit
extract → commit → push round trip before a `git pull` here will see it;
for urgent one-line fixes mid-session, editing directly on the VM (and
folding that edit back into the next zip afterward) is faster.
