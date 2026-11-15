-- After the first start on the new OpenMU: its own Crywolf warp (index 26, level 190) would show next to ours (index 24).
DELETE FROM config."WarpInfo" WHERE "Index" = 26 AND "Name" LIKE 'Crywolf%'
  AND EXISTS (SELECT 1 FROM config."WarpInfo" WHERE "Index" = 24 AND "Name" LIKE 'Crywolf%');
