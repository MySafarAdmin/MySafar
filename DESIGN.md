# Safar workspace design

The dashboard, the admin pages and the TV display share one design system. The
values live in `src/tokens.css` (inlined into the dashboard by `tools/build.py`
and served at the start of `/auth.css` for the sign-in and admin pages). The
dashboard's own screens are styled in `src/template.css`, the admin pages in
`static/auth.css`, and the TV in `static/tv.html`.

## Direction

A calm workspace that fits the screen. The palette is mostly neutral: a light
grey canvas, white working surfaces for the roster, forms and editors, graphite
type and a graphite navigation rail. Navy (`#003b6b`, from the logo) is kept for
three jobs only: the Safar brand, selected indicators (the top edge and text of
the selected tab, the selected student, the chosen segment) and the one primary
action on a screen (the selected student's Pass, Sign in, Save). Sage marks
healthy states and gold marks achievement, both sparingly. Colour appears
mostly in small indicators and data marks (dots, thin bars, chart columns), not
as panel fills; there are no tinted panels. Personality comes from type,
proportions and hierarchy.

The interface is light in every OS setting. An earlier version followed the
system dark mode, which drew the selected tab as navy text on a navy fill
(about 1.04:1); the dark tokens were removed rather than patched so the
previous dark direction does not return.

Daily work happens without scrolling: at 1280×720 the head and tabs take about
a sixth of the screen and a class of 20 is in view at once. Details are one
selection or one labelled button away: the selected student's panel shows only
the target and today's recording, with Details (identifiers, rename, remove)
and History behind buttons. Attention shows as the warning dot on a name in Quran
and the Concern group in Memo, never as a second student list. Each page has
one title; rules live in "?" help rather than paragraphs.

## Palette

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#eceef1` | The grey canvas behind everything. |
| `--surface` / `--surface-2` / `--sunk` | `#fff` / `#f6f7f9` / `#eceef1` | Working surfaces, hover, neutral pills and tracks. |
| `--line` / `--line-2` | `#e2e5e9` / `#c8cdd4` | Dividers; control borders and inactive chart columns. |
| `--ink` / `--ink-2` / `--mute` | `#1d2127` / `#3e4651` / `#5b6470` | Graphite text, secondary text, captions (all at least 4.5:1 on canvas and white). |
| `--rail-bg` | `#23272d` | Graphite navigation rail and toast. Rail text `#e8eaed`, muted `#a7adb5`. |
| `--navy` / `--navy-soft` | `#003b6b` / `#e9eff6` | Brand, selected indicators, the primary action (white text 11.4:1). |
| `--sage` / `-soft` / `-ink` | `#5e8a69` / `#eef3ef` / `#2f5a3b` | Healthy states: saved, Journey2Jannah marker. |
| `--gold` / `-soft` / `-ink` | `#b98a1e` / `#f8f2e2` / `#664a0b` | Achievement: prize dots, Prize won, Leading, merit +. |
| `--warn`, `--bad` | amber, red | Attention markers and destructive actions. Each has a `-soft` and an `-ink`. |

`--sky` and `--teal` remain as names for older rules but resolve to the same
quiet slate and sage, so nothing renders as a sky or teal panel.

Kept because they mean something: house colours (Makkah gold, Al-Aqsa blue,
Madinah green), house token colours (green 5, blue 20, red 50), the book level
colours (L1 brown, L2 blue, ...) and the warning levels (yellow, orange, red).
They appear as dots, thin bars, chart columns and the tint of a chosen option;
warning levels are a neutral label with a coloured dot. Text on a level colour
is picked by luminance (`onC()` in `src/page.html`).

## Type

Instrument Sans for everything you read and tap, with Source Serif 4 for page
titles, the Quran day and section headings (both self-hosted in
`static/fonts`, SIL Open Font License, set through `--font` and
`--font-display`). The pair was chosen in October 2026 as the closest freely
licensed match to Claude's own type (a geometric grotesk with a book serif for
titles); Claude's typefaces themselves are not licensed for reuse. Atkinson
Hyperlegible Next stays on the TV, which is read across a hall. Tabular figures
for every count. Sentence case throughout; no all-caps labels, no eyebrows
above titles.

## Layout

One shell everywhere: a 232px graphite rail on screens 960px and wider and a
graphite top bar with a Menu button below that. The dashboard opens with a
compact head on the canvas (`.head`: graphite title, Switch class on small
screens, save status, figures on one line with an amber dot on any figure that
needs attention, folder tabs) above the white workspace (`.ws`). The selected
tab is white with a navy top edge. The head is sticky on wide screens. Below
960px the tabs wrap as pills (a four-column grid below 380px) so every tab is
visible without sideways scrolling. Admin pages use `.band`, the same title and
figures on the canvas.

**Overview** tabs:

- **Summary**, one screen in three columns divided by hairlines: Needs
  attention (each kind as a large count with a small marker that opens its
  full list, and the warning levels), passes per week (grey columns, this week
  in navy) with the latest passes, house points and top classes, and students
  by level as columns whose heights are the counts.
- **Attention**: warnings, no pass in 3+ weeks, quiet classes; one list at a
  time, grouped by class, ten a page.
- **Classes**: the searchable directory, seven a page, and the CSV upload.
- **Rankings**: class ranking, furthest along, most passes, most merits side by
  side, five a page each, This month or All time.
- **Houses**: house totals, tokens by house, points by class (six a page).

**Record** (main navigation, admins only): level tests in four numbered steps,
Quran (Qaidah level) or Memo (target as level and target, or item number and
Surah), the student, the level, then a 0 to 5 score on the pastel scale and
Passed or Not passed, with the student's latest tests and Take back the latest
below. The score goes into that day's box on the Quran sheet with a gold border,
and the sheet will not change it; only the Record page can.

**Class** tabs (a class opens on Quran). Teachers see Quran, Memo, Progress,
Rewards and Settings, and so do admins (Record and Warnings were removed). All
recording starts from the Quran tab.

- **Quran** scores show as colour (pastel coral 0, peach, butter,
  pistachio, mint, sea green 5), with no key: the picker shows each number with
  its colour. Only the focused day also shows the number. Boxes are 40px in every class, so long classes scroll
  rather than shrink. A student's name opens a menu with Merits and − and + in
  its top right, then Warning 1, Warning 2 and Miss break, and their house
  tokens with − and +. The house is not repeated there; it is in the row.
- **Quran**: the day-by-day sheet. The focused class day sits in a soft navy
  lane between the student names and their houses, with up to three earlier
  days fading out to the left and three later ones to the right (one each side
  on phones). Only the focused column can be changed: tap a box for the 0 to 5
  picker, or select it and type a digit, which moves down to the next student.
  The arrows (or Left and Right on a box) move one class day; the names and
  houses fade out, the columns slide one place left like the next column of a
  page, and the names come back. Class days are the weekends from the first
  class day, any day with a score, and any day chosen with the calendar icon.
  The add-student icon opens a short form (name, house, optional Student ID)
  and the student is saved with the class straight away. Full sheet shows the
  whole table by class day.
- **Memo profile** actions: Details (identifiers, Rename, Remove student) and
  History. Passes, fails and targets are set on the Record page.
- **Memo**: the sheet, scrolling inside its frame.
- **Progress**: Levels (position in the book in two columns, students by
  level with empty levels named once in a line instead of zero rows),
  Students (the table), Pass history (passes per week, the history and Add a
  past pass).
- **Rewards**: Leaders and prize as one ranked list in two columns; with
  Passes and This month each row carries its five prize dots and "Prize won",
  and a line above names this month's winners in the order they won. House
  points: token counts with + and − for each colour (outlined buttons with the
  token colour in the +).
- **Settings**: one column of rounded rows in the Memo card style: class
  name, first class day, adding students, then reset and delete.

Long school-wide lists are paged with Previous and Next and a "1–10 of 61"
count; class lists stay whole. Below 640px modules go full-bleed and tables
become labelled rows.

## Components and states

Buttons: primary (navy, one per screen), default (outlined), quiet (text),
danger (red outline, solid red for the final irreversible step). A chosen
option in a row of toggles (warnings, Quran scores) is a light tint of its
meaning colour with a ring, keeping graphite text. 40px minimum height, 44px for
toggles and tabs. On touch screens and below 960px every control is at
least 44px tall. Segmented controls
(`.seg`) use `aria-pressed`. Help is a `<details class="help">` popover that
opens by keyboard, touch and pointer and closes with Escape. The drawer (`#drw`)
is a dialog with a white header, a focus trap, Escape to close and focus returned to the
control that opened it; it holds complete lists and student records.

States: loading ("Loading…"), empty ("No students yet" with the next step),
not recorded (Quran "Not recorded"), no activity ("No passes yet this month",
"Nothing recorded yet"), saving ("Saving…"), saved ("All changes saved"), and
failed (a red banner with Retry, Download unsaved changes or Sign in again, and
the status shows "Needs attention").

Rankings use competition ranking (1, 1, 3); ties are shown as "=1". Only values
above zero are ranked, and the rest are listed by name ("Not yet: ...").
Nothing is cut off at a podium: every ranked list pages through everyone.
Count badges never wrap their digits.

## Administration

Manage users leads with the accounts and an "Invite staff" button that jumps
to the invite form. All admin pages use the same canvas title and figures and
the same white modules.
They stay free of scripts and inline styles to match their content security
policy.

## TV

The TV is a hall display and keeps its own navy look (unchanged by the neutral
workspace). It keeps its two slides, rotation and privacy rules (first name and
surname initial, whole-school totals). House points are columns on one
baseline with heights in proportion to points; "Leading" and a gold number
appear only when a house is strictly ahead. Every joint first place is
highlighted. Star of the week and Passed a book shrink to fit, but never below
2.6% and 2.8% of the screen height; a list that still does not fit is split
into pages that turn every 10 seconds ("Page 1 of 3"), and the slide stays up
until every page has been shown. Names wrap rather than being cut off.

## Design skills in this repository

`.claude/skills/impeccable` (pbakaus/impeccable) and
`.claude/skills/ui-ux-pro-max` (uipro-cli) are installed for every Claude
session. Run `.claude/skills/impeccable/scripts/impeccable detect --json src/template.css`
for the static scan, and inject its `detect.js` into the running dashboard for
the in-browser scan. UI UX Pro Max's search for a neutral classroom dashboard
returned a zinc canvas (`#FAFAFA`), graphite primary (`#18181B`) and, among
the colour results, a minimal black-and-gold scheme; the grey canvas, graphite
rail and restrained gold come from those. Its pink accent and Lora/Raleway
pairing were not used, because the Safar navy and Atkinson type are fixed by
the brief. Its interaction guidance (hover, pressed, disabled and focus states)
is applied to every control.
`PRODUCT.md` records the product facts the skills read.

## Motion

Motion explains a change of place and is never decoration. The selected tab is
one marker that slides to the tab chosen; a tab under the pointer lifts by a
pixel and shows a short graphite edge; the new page slides in from the side its
tab is on. The Quran sheet slides its columns when the class day changes, and the Memo
calendar slides to the next or previous month. All
of it is off when the device asks for reduced motion (the rule at the end of
`src/tokens.css`).
