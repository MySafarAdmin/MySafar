# Safar workspace design

The dashboard, the admin pages and the TV display share one design system. The
values live in `src/tokens.css` (inlined into the dashboard by `tools/build.py`
and served at the start of `/auth.css` for the sign-in and admin pages). The
dashboard's own screens are styled in `src/template.css`, the admin pages in
`static/auth.css`, and the TV in `static/tv.html`.

## Direction

A calm operations workspace in Safar's own colours. Teachers open it between
lessons to find their class, record a pass and see who needs help, so the
screens are compact, quiet and predictable. Celebration (gold rank markers,
"Prize", the TV) is kept for real achievements: a value above zero, a prize
reached, a house leading.

## Palette

| Token | Value | Use |
| --- | --- | --- |
| `--navy` | `#003b6b` | Safar navy, sampled from the logo. Navigation rail, TV background. |
| `--primary` | `#0b5cad` | Primary actions (+ Pass, Sign in, Save). White text 6.7:1. |
| `--ink` / `--mute` | `#13243a` / `#56677c` | Text and secondary text (both above 4.5:1 on every surface). |
| `--bg` / `--surface` / `--line` | `#f3f6f9` / `#fff` / `#d8e1ea` | Page, panels, dividers. |
| `--warn`, `--bad`, `--ok` | amber, red, green | Attention, destructive, saved. Each has a `-soft` background and an `-ink` text colour. |

Kept because they mean something: house colours (Makkah gold, Al-Aqsa sky,
Madinah green), house token colours (green 5, blue 20, red 50), the book level
colours (L1 brown, L2 blue, ...) and the warning levels (yellow, orange, red).
Text on any of these is picked by luminance (`onC()` in `src/page.html`), so a
yellow chip gets dark text. Quran score colours were darkened enough to carry
white text.

Dark mode follows the system setting and `data-theme`, with the same tokens.

## Type

Atkinson Hyperlegible Next, self-hosted (`static/fonts`, SIL Open Font
License). It was designed for legibility at small sizes and distance, which
suits names read on phones and on the TV, and it has tabular figures for every
count. One family, weights 400/600/700/750. Scale: 13, 14, 15, 16 (body), 18
(panel titles), 26 (page title). Sentence case throughout; no all-caps labels.

## Layout and navigation

One shell everywhere: a navy rail on screens 960px and wider (Overview,
Journey2Jannah, the class list, Administration, then the signed-in person,
Account and Sign out) and a 52px navy top bar with a Menu button below that.
The current place is always marked: the white rail item is the open class or
admin page, the page heading names it, and the class tabs show the open tab.

- **Overview**: what needs attention first (warnings, no pass in 3+ weeks,
  classes with no activity this month), then the headline numbers, a
  searchable class directory table, and this month's houses and rankings.
  The CSV upload sits at the bottom, collapsed, for admins only.
- **Class**: a stat strip, an attention panel that appears only when something
  needs attention, then rankings, the book chart and student cards.
- **Input**: routine recording first (one row per student with the name,
  target and Pass / Merit / Fail counters together), then past passes, then
  class settings, then a separate "Reset and delete" panel. Renaming and
  removing a student live in the row's "…" menu.

## Components and states

Buttons: primary (blue), default (outlined), quiet (text), danger (red outline,
solid red for the final irreversible step). 40px minimum height, 44px for
toggles and tabs. Toggles (warnings, Quran scores) use `aria-pressed` and fill
with their meaning colour when selected. Every interactive element has a 3px
focus ring.

States: loading ("Loading class records…"), empty ("No students yet" with the
next step), not recorded (Quran "Not recorded"), no activity ("No passes yet",
"No passes yet this month"), saving (heading shows "Saving…"), saved ("All
changes saved"), and failed (a red banner with Retry, Download unsaved changes
or Sign in again, and the heading shows "Needs attention").

Rankings use competition ranking (1, 1, 3) as before. Ties are shown as "=1".
Zero values are never ranked: lists say "No passes yet this month" or "2
students not yet."

## TV

The TV keeps its two slides and privacy rules (first name and surname initial,
whole-school totals). It uses the navy palette, the logo on a white disc,
numbered gold/silver/bronze discs instead of emoji medals, and a "Leading"
badge for the top house only when it is strictly ahead.
