-- Desk soft-delete needs to write trips.discarded_at.
-- 0012 revoked table-level UPDATE and granted a column list; 0030 added
-- discarded_at without extending that grant, so anon/authenticated updates
-- silently updated 0 rows and live hydrate resurrected deleted waterfall trips.

grant update (discarded_at) on table trips to anon, authenticated;
