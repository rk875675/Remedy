---
name: ai-video-workflow
description: >-
  Recreate a winning ad or organic video with Kling 4.0 on Higgsfield, starring
  the Lindsey character. Use when the user mentions Ernesto's workflow, steal
  this workflow, a viral reference video, Kling 4 UGC ads, Lindsey, or asks to
  make an ad or organic video from a TikTok or ad link or a script.
---

# the only workflow you need to make ads and organic content with AI

The agent runs every step. The user only picks the video (or gives a script).

Same workflow for ads and organic content.

Generation is Higgsfield through the MCP (`user-higgsfield`, `https://mcp.higgsfield.ai/mcp`), video model `kling4_0`. Higgsfield only generates. It never edits: no video-edit mode, reframe, upscale, background removal, voice change, Shorts Studio, Marketing Studio, or TikTok publishing. All editing happens locally.

Work in `growth-engine/output/ai-ads/<slug>/`. Do not commit output. Do not upload unless asked.

The dashboard tab AI UGC (slides.remedyrecoveries) shows this workflow, the format database and the learnings. Its data lives in `growth-engine/apps/web/src/aiugc/` (`workflow.data.ts`, `formats.data.ts`, `doc.data.ts`). When this workflow changes, update `workflow.data.ts` in the same pass. After every reviewed video, add its rows to `LEARNINGS` and follow those rules from then on. A learning is an avoid or a never. Never store a sentence shape, a locked line, or a "write it like this." A recommendation names the video type and says something like it, not the line to copy. If the app demo recording is missing or too fast to read, do not cut a bad one in. Ask for a new recording of that exercise. The last step, after the video is approved, is the post title and caption, written into the marketing doc on that video's tab.

Approval gates: the owner confirms the reference video, then the idea and script, before any credits are spent. Then the owner approves the stills and the voice before motion.

## Character

The star is Lindsey: `growth-engine/assets/characters/lindsey/`.

- `profile.json`: who she is, her look, wardrobe, places, voice, rules, and the prompt spine for every still.
- `anchor.jpg`: her face. `options/` holds the alternate.
- `refs/`: real camera photos (Unsplash, camera EXIF, before 2023) for skin, hair, clothes, rooms, and light. `refs/sources.json` has provenance. Never pass a full face from `refs/` as an identity reference. New refs follow the same check.

Every post carries the platform AI label. She never claims results (no "Remedy fixed my back", no pain numbers). The app is Remedy. Do not copy the reference creator's face or voice.

## Part 1 — Steal the video

### 1. Reference video

Find a video that already went viral. A TikTok in your niche or an ad that has been running for months. The user sends the link and the agent downloads the video.

If the link cannot be downloaded, ask for the file. Do not publish the reference. It is only the timing source. A script from the user replaces the reference; then skip to step 3.

### 2. Gemini

Breaks the video down second by second. Every shot: what the person does, how they move, where the camera is, and every word they say with the time it is said.

If no Gemini key is set, do the same breakdown locally: frames with ffmpeg, words with faster-whisper.

Output: shot by shot breakdown, saved as `breakdown.md`. Show it before writing prompts.

### 3. Claude

Writes a prompt for every shot. Read the breakdown and write 1 prompt per shot with Lindsey and Remedy in it. Same movements, same camera and same timing as the original.

Each shot gets two prompts: a start-frame still (Lindsey in one of her places, phone-camera framing, the prompt spine from `profile.json`) and a motion prompt for that still.

Output: a prompt for every shot, saved as `prompts.md`.

## Part 2 — Make your version

### 4. Higgsfield · Kling

Generates every shot. Send each prompt to Higgsfield through the MCP. Check every clip and make it again if something looks off.

1. Still first: `nano_banana_pro`, 2K, 9:16, with Lindsey's face (her Element once it exists, else `anchor.jpg`) plus one or two `refs/` for room and light. About 2 credits. Redo until the frame is right; stills are the cheap place to fix a shot.
2. Then motion: `kling4_0`, mode `image-to-video`, the approved still as `start_image`, 720p, 9:16, 3 to 8 seconds. About 2.25 credits a second at 720p.
3. Preflight with `get_cost: true` before every job. One retry per shot, then change the shot instead of paying again.

Output: raw clips.

### 5. ElevenLabs

Swaps the voice. Take the lines from the breakdown, make them with an ElevenLabs voice, and put the new audio back on each clip on the same timing.

Silent formats (text on screen, no talking) skip this step. If a talking format comes up and no ElevenLabs voice is set, stop and ask. Do not clone the reference speaker.

Output: clips with the new voice.

### 6. Claude motion

Edits the whole thing. Put the clips in order and cut them like the original. Captions on every word, sound effects, music, and the cuts land on the beat. Upscale to 1080×1920 locally.

Output: the finished video ready to post. Deliver the mp4 path.
