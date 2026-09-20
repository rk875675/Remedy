-- 062_banded_rdl_v2_video.sql
-- Points Banded Romanian Deadlift at the reframed banded_rdl_v3.mp4.
-- Background fix: grey Kling pillarbox bars replaced with matching studio white.
-- Reframe: 1440x1440 square cropped to 1440x934 (20:13 AR) via pt-video-crop-center skill.
-- Upload: scripts/output/banded_rdl_v2.mp4 → r2://remedy-videos/exercises/banded_rdl_v3.mp4
-- Note: v2 key was uploaded twice (square then cropped) causing CDN cache conflict; v3 key is clean.

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/banded_rdl_v3.mp4'
WHERE name = 'Banded Romanian Deadlift' AND is_assignable = true;
