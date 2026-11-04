-- One-time backfill of patents."claimsText" from "claimsJson" (run after db:push adds the column).
-- Mirrors claimsToText() in lib/claims-text.ts. Safe to re-run.
UPDATE patents p
SET "claimsText" = sub.txt
FROM (
  SELECT id,
         NULLIF(string_agg(
           btrim(CASE WHEN jsonb_typeof(e) = 'string' THEN e #>> '{}' ELSE e ->> 'claim_text' END),
           E'\n' ORDER BY ord
         ) FILTER (WHERE btrim(CASE WHEN jsonb_typeof(e) = 'string' THEN e #>> '{}' ELSE e ->> 'claim_text' END) <> ''), '') AS txt
  FROM patents, jsonb_array_elements("claimsJson") WITH ORDINALITY AS t(e, ord)
  WHERE jsonb_typeof("claimsJson") = 'array'
  GROUP BY id
) sub
WHERE p.id = sub.id;
