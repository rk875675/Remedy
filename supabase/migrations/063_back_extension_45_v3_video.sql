-- 063_back_extension_45_v3_video.sql
-- Replace the gym-guy Pexels/v2 clip with the new Kling Back Extension (45°).
-- Right side pre-cropped just before the knees (weird lower-leg/feet), then
-- reframed to 20:13 via pt-video-crop-center (1400x908 → encoded 1280x830).
-- Upload: scripts/output/back_extension_45_v3.mp4 → r2://remedy-videos/exercises/back_extension_45_v3.mp4

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/back_extension_45_v3.mp4'
WHERE name = 'Back Extension (45°)' AND is_assignable = true;
