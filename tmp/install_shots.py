"""Copy edited onboarding shots into the screenshot library and drop the old set."""
import json
import shutil
from pathlib import Path

EDITED = Path(r"C:\Users\rkuma\remedy\tmp\edited")
LIB = Path(r"C:\Users\rkuma\remedy\growth-engine\assets\screenshots")
META = LIB / "meta.json"

SHOTS = [
    ("IMG_1785.PNG", "onboard_welcome.png", "Welcome: Stop thinking about your back. Continue, or I already have an account. Use for the open."),
    ("IMG_1788.PNG", "home_john_arnie_afternoon.png", "Home: Good afternoon, John. Arnie is fully grown. Sitting was the hard one. 19 min, 5 exercises."),
    ("IMG_1789.PNG", "progress_arnie_week.png", "Progress: This week 0 of 3. Arnie is fully grown. Stage strip at 15 sessions."),
    ("IMG_1790.PNG", "onboard_goal_ask.png", "Onboarding: What do you want most? Nothing selected. Arnie asks. Use for the goal question."),
    ("IMG_1791.PNG", "onboard_goal_relief.png", "Onboarding: goal, Less pain, day to day. Arnie: Relief first. Then we make it last."),
    ("IMG_1792.PNG", "onboard_goal_relief_move.png", "Onboarding: goals, Less pain and Move freely again. Arnie: Looser first, then stronger."),
    ("IMG_1793.PNG", "onboard_hard_bend.png", "Onboarding: what's hard right now, Bending or lifting. Arnie: Bending down is a mean ask."),
    ("IMG_1794.PNG", "onboard_hard_more.png", "Onboarding: anything else, stairs through sport, nothing selected. Button: None of these."),
    ("IMG_1795.PNG", "onboard_proof_chart.png", "Onboarding: Most back pain gets better. CMAJ 2012 chart, pain down by more than half in six weeks."),
    ("IMG_1796.PNG", "onboard_where_lower.png", "Onboarding: where it hurts, Lower back. Arnie's line is still finishing: Low back. The classic."),
    ("IMG_1797.PNG", "onboard_where_lower_done.png", "Onboarding: where it hurts, Lower back selected. Arnie: Low back. The classic."),
    ("IMG_1798.PNG", "onboard_spot_ask.png", "Onboarding: Does it stay in one place? Nothing selected. Arnie asks."),
    ("IMG_1799.PNG", "onboard_spot_same.png", "Onboarding: Does it stay in one place? Yes, the same spot. Arnie asks."),
    ("IMG_1800.PNG", "onboard_duration_ask.png", "Onboarding: How long has this been going on? Nothing selected. Arnie asks."),
    ("IMG_1801.PNG", "onboard_start_injury.png", "Onboarding: How did it start? An injury or accident. Arnie: Ouch. Noted."),
    ("IMG_1802.PNG", "onboard_feel_ask.png", "Onboarding: What does it feel like? Nothing selected. Arnie asks."),
    ("IMG_1803.PNG", "onboard_strength_7.png", "Onboarding: How strong on a normal day? Slider at 7, Strong. Arnie sits on the dial."),
    ("IMG_1804.PNG", "onboard_moving_ask.png", "Onboarding: How does moving feel? Nothing selected. Button: None of these."),
    ("IMG_1805.PNG", "onboard_moving_stiff.png", "Onboarding: How does moving feel? Stiff. Arnie: Stiff. Join the club."),
    ("IMG_1806.PNG", "onboard_better_ask.png", "Onboarding: Which feels better? Curling forward or standing tall. Nothing selected."),
    ("IMG_1808.PNG", "onboard_nerve.png", "Onboarding: Your nervous system is partly involved. Lancet 2023. A pattern check, not a diagnosis."),
    ("IMG_1809.PNG", "onboard_equipment_ask.png", "Onboarding: What can you train with? Nothing selected. Full gym is marked most room to grow."),
    ("IMG_1810.PNG", "onboard_reminders.png", "Onboarding: I'll nudge you when it's time. Notification: Arnie is ready. John, 15 minutes."),
    ("IMG_1812.PNG", "onboard_personalizing.png", "Onboarding: Personalizing your plan, choosing exercises at 34 percent. Arnie peeking."),
    ("IMG_1813.PNG", "onboard_personalizing_done.png", "Onboarding: Personalizing your plan, every step checked. Steady start. Arnie peeking."),
    ("IMG_1814.PNG", "onboard_program_top.png", "Onboarding: Lower Back Pain Relief Program. 10 weeks, 3 days a week, 6 min. Hold to commit."),
    ("IMG_1815.PNG", "onboard_program_phases.png", "Onboarding: How it builds. Settle 2 weeks, Control 1, Build 7. Week 1, 3 sessions."),
    ("IMG_1816.PNG", "onboard_program_built.png", "Onboarding: Built around you. Bending-sensitive back, steady start, nervous system partly involved."),
]

OLD = [
    "onboard_hear_instagram.png",
    "onboard_belief_yes.png",
    "onboard_recognize_lived.png",
    "onboard_goal_pain.png",
    "onboard_goal_mobility.png",
    "onboard_activity_strength.png",
    "onboard_worse_sit_bend.png",
    "onboard_equipment_gym.png",
    "onboard_time_15_4.png",
    "onboard_commit.png",
    "onboard_building.png",
    "onboard_building_eyes.png",
    "onboard_program.png",
]

for src, dest, desc in SHOTS:
    if len(desc) > 160:
        raise SystemExit(f"too long {dest} {len(desc)}")
    shutil.copyfile(EDITED / src, LIB / dest)
    print(f"copied {dest} ({len(desc)})")

meta = json.loads(META.read_text(encoding="utf-8"))
for name in OLD:
    meta.pop(name, None)
    png = LIB / name
    if png.exists():
        png.unlink()
        print("deleted", name)
    thumb = LIB / "thumbs" / (Path(name).stem + ".jpg")
    if thumb.exists():
        thumb.unlink()
        print("deleted thumb", thumb.name)

for _, dest, desc in SHOTS:
    meta[dest] = {"description": desc, "assign": False}

META.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
print("meta", len(meta))
