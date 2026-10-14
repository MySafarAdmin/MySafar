# Safar Academy dashboard: product

Drafted from the repository and the owner's redesign briefs (October 2026) for
the design skills in `.claude/skills`. Correct it here if anything is wrong.

## Users

- **Teachers** at Safar Academy Enfield record passes, merits, fails,
  warnings, Quran scores, memo progress and house tokens for their class,
  usually between lessons and often on a laptop or phone.
- **Administrators** watch whole-school performance, upload student lists,
  manage staff accounts and run the hall TV screens.

## Purpose

Keep every student's Quran memorisation journey (book levels L1 to L10, then
the numbered Juz items) accurate and visible, and celebrate achievement
through houses, prizes and the TV.

## Constraints

- Records, scoring rules, permissions, sign-in and TV privacy (first name and
  initial only) stay as they are.
- Flask on Railway with a single-page dashboard built by `tools/build.py`;
  merging to `main` deploys the live site.
- Keep Safar's logo and navy identity.
- Daily recording must fit the screen: the class in front of the teacher,
  details one selection away.
