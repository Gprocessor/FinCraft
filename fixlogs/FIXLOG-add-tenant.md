# Fix Log — `add-tenant.sh` fails on every tenant with "duplicate key value violates unique constraint tenants_identifier_key"

**Status: fixed below.**

## Bug

Step `[2/6]` clones the existing `fincraft` tenant row to create the new
tenant row:

```sql
SELECT string_agg(quote_ident(column_name), ', ') INTO ten_cols
  FROM information_schema.columns WHERE table_name='tenants' AND column_name<>'id';
EXECUTE format('INSERT INTO tenants (%1$s) SELECT %1$s FROM tenants ORDER BY id LIMIT 1', ten_cols);
UPDATE tenants SET identifier='${IDENT}', ... WHERE id=(SELECT max(id) FROM tenants);
```

`ten_cols` excludes only `id`, so it still includes `identifier`. The
`INSERT` therefore clones the template row **with its original
`identifier='fincraft'` still in it**, and that insert itself violates
`tenants_identifier_key` before the row exists at all — the following
`UPDATE ... SET identifier='${IDENT}'` never runs, because there's no row
to update.

This isn't specific to any one tenant name — it fails identically for
`darkvera`, `darkvera2`, or any other identifier, every time, since the
collision is always against the pre-existing `fincraft` row.

The `tenant_server_connections` insert one line above (same copy pattern)
doesn't hit this because none of its columns are unique-constrained, so it
silently succeeds and leaves an **orphaned row** (no `tenants` row ever
points `oltp_id` at it) on every failed attempt.

## Fix

Exclude `identifier` from the blind column copy and supply the real new
identifier directly in the `INSERT` (quoted via `format(...,%L)`), instead
of insert-with-wrong-value-then-update:

```sql
SELECT string_agg(quote_ident(column_name), ', ') INTO ten_cols
  FROM information_schema.columns WHERE table_name='tenants' AND column_name NOT IN ('id','identifier');
EXECUTE format('INSERT INTO tenants (identifier, %1$s) SELECT %2$L, %1$s FROM tenants ORDER BY id LIMIT 1', ten_cols, '${IDENT}');
UPDATE tenants SET name='${DISPLAY}', oltp_id=new_conn_id WHERE id=(SELECT max(id) FROM tenants);
```

## Cleanup needed on already-affected deployments

Every failed run leaves one orphaned `tenant_server_connections` row (the
first INSERT in the block succeeds; only the `tenants` INSERT fails). Before
re-running `add-tenant.sh` with the fix, remove the orphans so they don't
accumulate:

```sql
DELETE FROM tenant_server_connections WHERE id NOT IN (SELECT oltp_id FROM tenants);
```

The `CREATE DATABASE` step in `[1/6]` succeeds on every attempt too (it's
guarded by `|| echo "(may already exist)"`), so any already-created empty
tenant databases (e.g. `fineract_darkvera`, `fineract_darkvera2`) are
harmless leftovers — fine to leave, or `DROP DATABASE` them if you want a
clean slate.
