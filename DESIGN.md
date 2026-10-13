# Safar workspace design

The dashboard, the admin pages and the TV display share one design system. The
values live in `src/tokens.css` (inlined into the dashboard by `tools/build.py`
and served at the start of `/auth.css` for the sign-in and admin pages). The
dashboard's own screens are styled in `src/template.css`, the admin pages in
`static/auth.css`, and the TV in `static/tv.html`.

## Direction

A mixed-surface workspace rooted in Safar's navy. Navy carries navigation and
the one band that opens every page (title, the class or school's key numbers,
and the book ribbon). Below it the page is light: a pale canvas, white working
surfaces and a few tinted modules. Colour is assigned by meaning, not
decoration: sky blue for learning and passes, teal for progress over time,
gold for achievement, and the house, level, token and warning colours keep
their existing meanings. Each page has one title; rules and instructions live
in "?" help popovers rather than paragraphs on the page.

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
figures for every count. Weights 400/600/700/800. Scale: 13, 14, 15, 16 (body),
18 (module titles), 24 to 32 (page title, by screen width), 40 (band figures).
Numbers that matter are the largest thing in their module. Sentence case
throughout; no all-caps labels, no eyebrows above titles.

## Layout

One shell everywhere: a 232px navy rail on screens 960px and wider and a navy
top bar with a Menu button below that. Pages open with the navy band
(`.band`, `.band.slim` on admin pages) and continue on a 12-column grid
(`.g12` with `.s4` to `.s8` spans from 1100px). Modules differ by purpose:

- `.mod` white working surface, `.mod.line` bordered, `.mod.sky`, `.teal`,
  `.gold` tinted for the contexts above. Paired modules use `.g12.eq` to share
  a height; everything else aligns to the top so short modules leave no holes.
- Tables and lists run full width; summaries sit in narrower columns beside them.
- Below 640px modules go full-bleed and the band becomes a 3-column figure grid.

**Overview** has three tabs. Summary: band figures and the book ribbon, then
attention summarised by category with the top classes for each and "See all N"
opening the complete list grouped by class in a drawer; passes per week and
the latest passes beside it; the searchable class directory; houses and the top
classes with a link to the full rankings. Rankings: class ranking, furthest
along, most passes, most merits (each complete on demand). Houses: points by
house, tokens by house, points by class.

**Class** has a compact identity (the band title; "Switch class" opens a
searchable drawer on small screens) and seven tabs: Record (default: the roster
with Pass / Merit / Fail counters, target and a "…" menu, with attention,
leaders and the latest records beside it from 1280px), Warnings, Quran, Memo,
Progress (position in the book, students by level, the students table, passes
per week and the complete pass history), Rewards (one Leaders module with
Passes/Merits and This month/All time controls, the prize, house points) and
Settings (class settings, adding students, and a separate danger panel).
Dated records default to a useful current period (this month, the last six
weeks, recent memo dates) with "All" one press away.

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
Nothing is cut off at a podium: every ranked list can show everyone.

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
highlighted. "Passed a book" leads with the count in gold and fits up to three
columns of names. Type is sized in viewport units for reading across a hall.

## Design skills in this repository

`.claude/skills/impeccable` (pbakaus/impeccable) and
`.claude/skills/ui-ux-pro-max` (uipro-cli) are installed for every Claude
session. Run `.claude/skills/impeccable/scripts/impeccable detect --json src/template.css`
for the static scan, and inject its `detect.js` into the running dashboard for
the in-browser scan. UI UX Pro Max's generic design-system suggestion (a
storytelling landing pattern, Fira type and an orange CTA) does not fit an
operations dashboard and is not used; its accessibility and touch checks are.
