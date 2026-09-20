-- 065_kettlebell_deadlift_v7_video.sql
-- Wire newest Kling Kettlebell Deadlift. Cropped 1920x1080 → 1660x1080 (20:13),
-- encoded to 1280 wide. New key to avoid CDN cache on kettlebell_deadlift.mp4.
-- Upload: scripts/output/kettlebell_deadlift_v7.mp4
--      → r2://remedy-videos/exercises/kettlebell_deadlift_v7.mp4

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/kettlebell_deadlift_v7.mp4'
WHERE name = 'Kettlebell Deadlift' AND is_assignable = true;
