# Safar workspace design

The dashboard, the admin pages and the TV display share one design system. The
values live in `src/tokens.css` (inlined into the dashboard by `tools/build.py`
and served at the start of `/auth.css` for the sign-in and admin pages). The
dashboard's own screens are styled in `src/template.css`, the admin pages in
`static/auth.css`, and the TV in `static/tv.html`.

## Direction

A workspace that fits the screen. Navy carries identity and navigation: the
rail, and one compact head per page that holds the title, the key numbers on a
single line and the tabs. The selected tab is white and opens straight into a
white workspace on a pale canvas, so the work itself is the largest surface.
Tinted modules (sky, teal, gold, amber for attention) mark insight, never
chrome. Daily work happens without scrolling: at 1280×720 the head and tabs
take under a fifth of the screen and a class of 20 is in view at once; details
are one selection away in a side panel, a drawer, a tab or a "?" popover.
Colour is assigned by meaning: sky blue for learning and passes, teal for
activity over time, gold for achievement, amber and red for attention, and the
house, level, token and warning colours keep their existing meanings. Each
page has one title; rules live in "?" help rather than paragraphs.

## Palette

| Token | Value | Use |
| --- | --- | --- |
| `--navy` | `#003b6b` | Safar navy, sampled from the logo. Rail, the page band, selected tabs, the drawer header, the TV. |
| `--primary` | `#0b5cad` | Primary actions (+ Pass, Sign in, Save). White text 6.7:1. |
| `--sky` / `-soft` / `-ink` | `#1f7fc4` / `#e6f2fb` / `#0b5287` | Learning: the level distribution, most passes. |
| `--teal` / `-soft` / `-ink` | `#0f857a` / `#def3ef` / `#0a5c54` | Progress over time: passes per week, recent activity. |
| `--gold` / `-soft` / `-ink` | `#c4910f` / `#fcf2d6` / `#664700` | Achievement: the prize, merits, leading figures in the band (`#ffd27a` on navy). |
| `--ink` / `--mute` | `#13243a` / `#56677c` | Text and secondary text (both above 4.5:1 on every surface). |
| `--bg` / `--surface` / `--line` | `#eef2f6` / `#fff` / `#d8e1ea` | Canvas, working surfaces, dividers. |
| `--warn`, `--bad`, `--ok` | amber, red, green | Attention, destructive, saved. Each has a `-soft` background and an `-ink` text colour. |

Kept because they mean something: house colours (Makkah gold, Al-Aqsa sky,
Madinah green), house token colours (green 5, blue 20, red 50), the book level
colours (L1 brown, L2 blue, ...) and the warning levels (yellow, orange, red).
House totals are compared with a proportional bar under each
number rather than a coloured edge. Text on any of these is picked by luminance (`onC()` in `src/page.html`).
Dark mode follows the system setting and `data-theme`, with dark variants of
every token.

## Type

Atkinson Hyperlegible Next, self-hosted (`static/fonts`, SIL Open Font
License), chosen for legibility at small sizes and at a distance, with tabular
figures for every count. Weights 400/600/700/800. Scale: 12 and 13 (meta,
labels), 15 and 16 (body), 18 (section titles), 20 (counts in the roster and
head figures), 24 (page title), 32 (attention counts), 36 (house totals).
Numbers that matter are the boldest thing in their row. Sentence case
throughout; no all-caps labels, no eyebrows above titles.

## Layout

One shell everywhere: a 232px navy rail on screens 960px and wider and a navy
top bar with a Menu button below that. The dashboard opens with the compact
navy head (`.head`: title, Switch class on small screens, save status, figures
on one line, folder tabs) above the white workspace (`.ws`). The head is
sticky on wide screens. Admin pages use the shorter `.band`.

**Overview** tabs:

- **Summary**, one screen: Needs attention (each kind as a large count that
  opens its full list, the warning levels, and the class most affected), passes
  per week with the latest passes, house points, top classes this month, and
  students by level as columns whose heights are the counts.
- **Attention**: warnings, no pass in 3+ weeks, quiet classes; one list at a
  time, grouped by class, ten a page.
- **Classes**: the searchable directory, seven a page, and the CSV upload.
- **Rankings**: class ranking, furthest along, most passes, most merits side by
  side, five a page each, This month or All time.
- **Houses**: house totals, tokens by house, points by class (six a page).

**Class** tabs:

- **Record**: the roster in two columns from 1100px (one below), each row a
  name with its target and flags, then Passes and Merits as a count and a +.
  Selecting a name opens the editor beside the roster (in the drawer on
  smaller screens): target, Passes / Merits / Fails with − and +, details,
  Details and history, Rename, Remove. With nobody selected the panel shows
  who needs attention, the latest records and this month's leaders. Arrow
  keys move between names.
- **Warnings** and **Quran**: two columns of one-line rows; Quran switches
  between recording a day and the By class day sheet.
- **Memo**: the sheet, scrolling inside its frame.
- **Progress**: Levels (position in the book in two columns, students by
  level), Students (the table), Pass history (passes per week, the history and
  Add a past pass).
- **Rewards**: Leaders and prize, or House points (token counts with + and −
  for each colour in two columns, house totals in the toolbar).
- **Settings**: name and first class day, adding students, reset and delete.

Long school-wide lists are paged with Previous and Next and a "1–10 of 61"
count; class lists stay whole. Below 640px modules go full-bleed and tables
become labelled rows.

## Components and states

Buttons: primary (blue), default (outlined), quiet (text), danger (red outline,
solid red for the final irreversible step). 40px minimum height, 44px for
toggles and tabs. On touch screens and below 960px every control is at
least 44px tall. Segmented controls
(`.seg`) use `aria-pressed`. Help is a `<details class="help">` popover that
opens by keyboard, touch and pointer and closes with Escape. The drawer (`#drw`)
is a dialog with a focus trap, Escape to close and focus returned to the
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
to the invite form. All admin pages use the slim band and the same modules.
They stay free of scripts and inline styles to match their content security
policy.

## TV

The TV keeps its two slides, rotation and privacy rules (first name and
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
the in-browser scan. UI UX Pro Max's design-system search for an education
classroom operations dashboard recommends a data-dense, drill-down dashboard;
that pattern is used. Its suggested dark palette and Fira type are not, because
the Safar navy, white workspace and Atkinson type are fixed by the brief.
`PRODUCT.md` records the product facts the skills read.
