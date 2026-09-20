-- 064_leg_press_v2_video.sql
-- Wire new Kling Leg Press clip. Cropped 1920x1080 → 1660x1080 (20:13) to
-- drop empty right studio, then encoded to 1280 wide.
-- Upload: scripts/output/leg_press_v2.mp4 → r2://remedy-videos/exercises/leg_press_v2.mp4

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/leg_press_v2.mp4'
WHERE name = 'Leg Press' AND is_assignable = true;
