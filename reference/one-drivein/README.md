# Reference snapshot — ONE Drive-in (Hyderabad)

Unmodified seed from the private project
[onedrivein-ordernow-preorder](https://github.com/scarsymmetry899/onedrivein-ordernow-preorder).
Kept for lineage. The US Route 66 app does not import these files, does not
call Supabase, and does not run the edge functions.

The `.env.example` here is the original template. Every value is a placeholder.
Do not fill it in on this public repo.

What the archive contained:

- `supabase/migrations/001_initial_schema.sql` — `one_drivein_orders` and `one_drivein_unavailable`
- `supabase/functions/process-order/index.ts`
- `supabase/functions/scheduler/index.ts`
- `supabase/functions/update-location/index.ts`
- `docs/architecture.md`
- `make/README.md` — Make.com scenario notes. The blueprint JSON files named there were not in the archive.
- `.env.example`

`scripts/` was an empty directory in the archive and is not in git.

See [docs/SOURCE.md](../../docs/SOURCE.md) for what was adapted into the US scaffold.
