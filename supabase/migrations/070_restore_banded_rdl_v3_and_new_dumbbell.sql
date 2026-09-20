-- 070_restore_banded_rdl_v3_and_new_dumbbell.sql
-- Banded RDL: restore the newer Kling clip (v3 framing) with side bars
-- recolored to the studio wall (~234) instead of the mismatched grey/white.
-- Dumbbell RDL: new Kling download, measured 20:13 crop (1660x1080 at x=258)
-- so the extra left studio is removed and she sits in the session player.
--
-- Upload: scripts/output/banded_rdl_v5.mp4
--      → r2://remedy-videos/exercises/banded_rdl_v5.mp4
--         scripts/output/dumbbell_rdl_v8.mp4
--      → r2://remedy-videos/exercises/dumbbell_rdl_v8.mp4

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/banded_rdl_v5.mp4'
WHERE name = 'Banded Romanian Deadlift' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/dumbbell_rdl_v8.mp4'
WHERE name = 'Dumbbell Romanian Deadlift' AND is_assignable = true;
