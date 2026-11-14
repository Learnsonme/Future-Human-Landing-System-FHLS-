# Team setup notes (hackathon)

These were the team's preparation notes for the event. Moved here from the top-level README during the clean-up.

## Preparation for the day
1. Clone the git repo on your device.
2. Set up your AI agent.
3. Tell your AI: "Read AGENTS.md, then roles/T1_viewer.md (or T2_web / T3_engine_design), then TASKS.md and LOG.md. Claim your first task."

## Links
1. Team page: https://www.spaceappschallenge.org/2026/find-a-team/future-human-landing-system-fhls/
2. GitHub repo: https://github.com/Learnsonme/Future-Human-Landing-System-FHLS-.git
3. Google Drive (big inputs, such as the SPICE kernels): https://drive.google.com/drive/folders/1rofQzyBaOw7L1YHnv8hBc3y6VF6HwJf2?usp=drive_link
   - Copy the kernel files into `engine/kernels/` (they are git-ignored).
   - Run `python3 test_spice.py` from `engine/` to check that SPICE works. Expected output:
     ```
     SUN    azimuth  223.8°   elevation  0.34°
     EARTH  azimuth  129.6°   elevation  5.24°
     SPICE works ✔
     ```
4. Live site: https://learnsonme.github.io/Future-Human-Landing-System-FHLS-/
