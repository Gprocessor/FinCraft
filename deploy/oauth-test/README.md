# OAuth boot test — throwaway, not part of the real deploy

Answers one question: does the standard `apache/fineract:latest` image (what
your production `deploy/docker-compose.yml` actually uses) start up cleanly
with `FINERACT_SECURITY_OAUTH_ENABLED=true`, or does current official Fineract
documentation's claim — that this requires rebuilding from source with
`-Psecurity=oauth` — hold true for this image?

There are two contradicting things in Fineract's own docs about this, so
rather than guess, this just tries it directly, in complete isolation from
your real deployment.

## Run it

On any machine with Docker (does **not** need to be your production VM —
your laptop, a scratch VM, a fresh Cloud Shell session, anything):

```
cd deploy/oauth-test
docker compose up
```

Don't background it (no `-d`) — watch the logs scroll by directly.

## What to look for

- **It reaches a steady "started" state and just sits there logging nothing
  new** (no exceptions, no restart loop) → good sign. The image supports at
  least some OAuth2 wiring without a rebuild. Paste me the last ~30 lines of
  log output and we'll figure out what's actually listening and plan the
  Keycloak side next.

- **It exits, crash-loops, or logs an exception during startup** (anything
  mentioning security config, OAuth, missing beans, or similar, right before
  it dies) → confirms the current docs are right for this image: we'd need
  the full source rebuild with `-Psecurity=oauth` instead. Paste me the
  exception and we'll plan that path.

Either way, **paste the output back** rather than trying to interpret it
yourself — I'd rather read the actual log than guess at what a given error
means.

## Clean up when done

```
docker compose down -v
```

That removes the containers AND the throwaway database volume — nothing
persists, nothing to remember to delete later.

## Why this is safe

- Different container names (`fineract-oauth-test-*`) and ports
  (18443/15432) than production (8443/5432) — even run on the same host,
  nothing collides.
- All-throwaway passwords, not your real ones.
- No nginx/UI container — this only tests whether Fineract itself boots in
  OAuth mode, nothing else.
- Doesn't touch `deploy/docker-compose.yml`, `deploy/.env`, or anything else
  in the real deploy.
