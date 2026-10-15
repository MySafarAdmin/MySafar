# Safar workspace design

The dashboard, the admin pages and the TV display share one design system. The
values live in `src/tokens.css` (inlined into the dashboard by `tools/build.py`
and served at the start of `/auth.css` for the sign-in and admin pages). The
dashboard's own screens are styled in `src/template.css`, the admin pages in
`static/auth.css`, and the TV in `static/tv.html`.

## Direction

A friendly, calm workspace that fits the screen. The fifth pass (October 2026)
borrows the best parts of Journey2Jannah, which the school's teachers use
every day: one rounded, friendly sans for all type, a greeting at the top of
the overviews ("Assalāmu ʿalaykum Sr Maryam!"), white cards with round corners floating on a soft cool-grey canvas
with a faint shadow instead of hairline borders, pill-shaped buttons, tabs and
segmented controls, classes shown as cards with a patterned banner and a year
tile, and a split sign-in page with a welcome panel and a short saying.

Safar keeps its own colours rather than Journey2Jannah's purple: the
navigation rail is Safar navy (`#003b6b`, from the logo) with the selected item
as a white tab with navy type, as Journey2Jannah carries its colour in its
rail. Inside the workspace navy stays for titles, selected indicators and the
one primary action on a screen. Sage marks healthy states and gold marks
achievement, both sparingly; the pastel Quran score colours are unchanged.
Colour inside cards appears mostly in small indicators and data marks; the
banners on class cards and the greeting pills are the only pastel fills.

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
| `--bg` | `#f2f4f8` | The soft cool-grey canvas behind everything. |
| `--surface` / `--surface-2` / `--sunk` | `#fff` / `#f6f7fb` / `#eef0f5` | Cards, hover, neutral pills and the track of segmented controls. |
| `--line` / `--line-2` | `#e4e7ee` / `#cbd1dc` | Dividers; control borders and inactive chart columns. |
| `--ink` / `--ink-2` / `--mute` | `#1c2230` / `#3c4557` / `#5a6375` | Slate text, secondary text, captions (all at least 4.5:1 on canvas and white). |
| `--rail-bg` | `#003b6b` | Navy navigation rail. Rail text `#e6eef6`, muted `#a9c0d6`; the selected item is white with navy text. |
| `--navy` / `--navy-soft` | `#003b6b` / `#e9eff6` | Brand, page titles, selected indicators, the primary action (white text 11.4:1). |
| `--sage` / `-soft` / `-ink` | `#5e8a69` / `#eef3ef` / `#2f5a3b` | Healthy states: saved, Journey2Jannah marker. |
| `--gold` / `-soft` / `-ink` | `#b98a1e` / `#f8f2e2` / `#664a0b` | Achievement: prize dots, Prize won, Leading, merit +. |
| `--warn`, `--bad` | amber, red | Attention markers and destructive actions. Each has a `-soft` and an `-ink`. |
| `--r` / `--r-lg` / `--r-pill` | `12px` / `20px` / `999px` | Inputs and small boxes; cards and workspaces; buttons, tabs and chips. |
| `--shadow` | two soft layers | Cards float on the canvas instead of carrying a border. |

Class cards and greeting pills use four pastel pairs (coral, sky, mint,
butter) with dark text of the same hue, each above 4.5:1.

`--sky` and `--teal` remain as names for older rules but resolve to the same
quiet slate and sage, so nothing renders as a sky or teal panel.

Kept because they mean something: house colours (Makkah gold, Al-Aqsa blue,
Madinah green), house token colours (green 5, blue 20, red 50), the book level
colours (L1 brown, L2 blue, ...) and the warning levels (yellow, orange, red).
They appear as dots, thin bars, chart columns and the tint of a chosen option;
warning levels are a neutral label with a coloured dot. Text on a level colour
is picked by luminance (`onC()` in `src/page.html`).

## Type

Figtree for everything, text and titles alike (self-hosted in `static/fonts`,
SIL Open Font License, set through `--font`; `--font-display` points at the
same family). The user asked for Journey2Jannah's font; its files could not be
inspected from here and its look (a rounded geometric sans close to Gilroy, a
commercial face) has no licence for self-hosting, so Figtree was chosen in
October 2026 as the closest free match after comparing it with Plus Jakarta
Sans, Outfit, Urbanist, Nunito, Mulish and Lexend against a crop of the
Journey2Jannah greeting. Titles are 800 weight in navy; body text is 400.
Atkinson Hyperlegible Next stays on the TV, which is read across a hall.
Tabular figures for every count. Sentence case throughout; the one all-caps
label is the Sign in button and the Welcome tab on the sign-in page, as on
Journey2Jannah.

## Layout

One shell everywhere: a 232px navy rail on screens 960px and wider, and below
that a navy top bar with the name and a floating dock at the bottom of the
screen. The dashboard opens with a
compact head on the canvas (`.head`: navy title, or on the overviews the
greeting with the overview's name under it; Switch
class on small screens, save status, the figures button, then pill tabs) above
the white workspace card (`.ws`, 20px corners). The selected tab is a white pill
with navy type and a soft shadow. The head is sticky on wide screens. Below
960px the tabs wrap as pills and the selected one turns navy (a two-column grid below 380px) so every tab is
visible without sideways scrolling. Admin pages use `.band`, the same title and
figures on the canvas.

**Phone dock** (below 960px, `.dock` in tokens.css): a white, slightly
translucent bar with 26px corners floating 10px above the bottom edge (and the
home indicator), with an icon and a short label per item. A teacher always has
Home, Quran, Memo, Progress, Rewards and More; tapping a class page from
elsewhere opens the class used last. An admin has Home, Classes, Record and
More, and while a class is open Classes, the four class pages and More. The
class tab row is not shown above the page on phones, since the dock carries it;
Class settings is the first item under More. The selected item sits in a pastel
bubble of its own colour (sky, mint, butter, lavender, coral) with a small pop;
the rest are graphite. More turns navy and opens the full menu (the rail's
links, Account and Sign out) as a navy card rising from the dock over a dim
scrim; Escape or a tap outside closes it. The admin and account pages carry the
same dock as plain links (`/#classes`, `/#record`, `/#tab-Q` and so on) and a
CSS-only More, since they run without scripts. While a text field has the
keyboard open on a touch screen the dock slides away. Toasts rise above it.

**Quran on phones** (a sheet under 600px wide): only the focused day shows, as
three columns: the name on the left, the day's box in the middle of the screen
under the date, and the house on the right. A long name wraps onto a second
line. No message pops up after each score; the box shows it. Tapping
a box raises the score picker from the bottom: the student's full name, the
day, six large score buttons and Clear, over a dim backdrop that closes it.

**Classes** is its own page in the rail, under Journey2Jannah, in place of the
old list of class names: searchable class cards (patterned banner, year tile,
students, passes, merits and warnings), all on one scrolling page, with the CSV
upload under them. A card opens that class with every tab, Settings included; the rail keeps
Classes marked while a class is open, and Switch class sits by the title.

The name is MySafar, set as a wordmark with "My" in the regular weight and
"Safar" in the heavy weight. The browser tab icon (`/favicon.png`) is the logo
on a white disc.

**Overview** tabs:

- **Summary**, one screen in three columns divided by hairlines: Needs
  attention (each kind as a large count with a small marker that opens its
  full list, and the warning levels), passes per week (grey columns, this week
  in navy) with the latest passes, house points and top classes, and students
  by level as columns whose heights are the counts.
- **Attention**: warnings, no pass in 3+ weeks, quiet classes; one list at a
  time, grouped by class, ten a page.
- **Rankings**: class ranking, furthest along, most passes, most merits side by
  side, five a page each, This month or All time.
- **Houses**: house totals, tokens by house, points by class (six a page).

**Record** (main navigation, admins only): level tests in four numbered steps,
Quran (Qaidah level) or Memo (target as level and target, or item number and
Surah), the student, the level, then a 0 to 5 score on the pastel scale and
Passed or Not passed, with the student's latest tests and Take back the latest
below. The score goes into that day's box on the Quran sheet with a gold border,
and the sheet will not change it; only the Record page can.

**Centred on big screens**: from 1500px wide the content column narrows to
1360px, centred beside the side menu, and on screens taller than 860px a top gap
grows with the height (up to 120px), so the title, tabs and work sit nearer the
middle of the screen. Nothing changes at 1280x720.

**Class overview** (teachers): the Overview title reads Class overview and its
Summary opens with Needs attention, then Rankings (House points, and the top
three students for Most passes and for Most merits), then Passes per week and
Students by level. Each of those section titles (and Top classes) has a small
arrow and opens its full list in a pop-up (the side drawer; a sheet on phones),
so the details don't need a trip to another tab. The Attention, Rankings and
Houses tabs stay as they were (the user kept them). No latest passes or
Furthest along list on the Summary; admins keep Furthest along on their
Rankings tab. The **school overview** (admins) uses the same layout with
school-wide figures, and its last row adds Top classes and Latest passes.

**Record page look**: a subtitle under the title, the four numbered steps down
the left of the workspace divided by hairlines like the overview's sections (a
step's number fills navy once answered), and the chosen student in a soft grey
panel on the right (class, house, Memo target, Qaidah level, latest level tests,
Take back the latest). On phones the panel follows the steps.

**Star of the week**: a star button beside Day by day / Full sheet on the Quran
tab picks one student for the week holding the focused class day; a gold star
sits by their name. Kept on the student as the Monday of each week (sw).

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
  The calendar icon opens a whole-year pop-up (twelve months, Monday first,
  days outside each month faded): class days are bold, days with scores carry
  a small sage dot, today is a filled navy circle and the day on show is
  ringed. Days before the first class day can't be picked; picking a day jumps
  the sheet there. Arrow keys move a day or a week, Page Up and Down a month.
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
one white pill that slides to the tab chosen; a tab under the pointer lifts by a
pixel; a class card lifts slightly under the pointer; the new page slides in from the side its
tab is on. The Quran sheet slides its columns when the class day changes, and the Memo
calendar slides to the next or previous month. All
of it is off when the device asks for reduced motion (the rule at the end of
`src/tokens.css`).

**Opening titles** (sign-in page): a fresh visit to /login (not after signing
out or a failed attempt) plays a short CSS-only sequence of about 4 seconds. A
deep navy stage with twinkling points; the gold eight-point star draws itself
around the round logo; MySafar rises in; then the stage crossfades into the
sign-in screen (a 1.4 second fade) while the form rises in underneath. The sign-in fields stay disabled while the opening plays and are enabled, with the email field focused, once it ends (static/intro.js, the one script the sign-in page runs), so saved-password suggestions appear then and not over the animation. Off
under reduced motion. Styles at the end of static/auth.css.
The opening's end overlaps the fade: the card floats up out of a soft blur with
its parts following one by one, and the welcome panel's quote and art drift in.
Afterwards the welcome panel keeps an idle sky: a shooting star every few
seconds and a few twinkling points. "Safar Academy Enfield" appears once, under
MySafar in the card's logo (no footer, nothing under the panel's wordmark).

**Greeting after signing in**: the first dashboard load after signing in shows
only the overview's own greeting ("Assalāmu ʿalaykum ...!"), typed out letter
by letter, large in the middle of the page, with a navy caret (a copy set at the
large font size, so it stays sharp, wrapping as the heading does; every letter is
laid out from the start, so lines never reflow). Once the records have loaded and
the greeting is typed, it shrinks and moves into its usual place in one motion,
and the rest of the page fades in behind it: on a computer the navy side menu
slides in from the left edge with its items following, the tabs rise, the
overview sections and class cards rise in turn, ranking rows follow, and the
bars grow. Once per sign-in (html.fresh, then body.enter for a few seconds),
off under reduced motion.

**Motion system** (page.html "Motion", template.css "Motion system"): one
easing, about 150-200ms for feedback and 200-300ms for panels. Views are drawn
with innerHTML, so a MutationObserver gives redrawn content continuity before it
paints, using Web Animations only (nothing is held back, controls work at once):
bars grow from nothing the first time they are seen and afterwards glide from
their old length (This month / All time changes the numbers at once and only
moves the bars); ranked students, houses and class cards glide to their new
places by name, and new rows fade in; class cards rise in a short stagger the
first time the Classes page is drawn; on Record a new step or a newly chosen
student's panel fades in and a level test just saved flashes green. Segmented
controls have a sliding thumb (.segi) and the side menu a sliding marker
(.navi). Class cards lift on hover, sink when pressed and show a navy ring for the
keyboard. Off under reduced motion and during the sign-in arrival.

**Sign-in layout**: on a computer the white sign-in card is on the left and the
navy welcome panel on the right.

**Tracker button on phones**: a teacher's overview on a phone has one large
navy "Open tracker" button straight under the greeting (just the words), since
entering the day's scores is why most teachers open the app. It opens the class
they used last on the Quran tab (Switch class is there for the others). The
teacher's class chips that sat beside "Class overview" are gone. Not shown on
wider screens or to admins.

**New tab, new sign-in**: opening the site in a new tab or window always starts
at the sign-in page; refreshing a signed-in tab keeps you signed in (a
sessionStorage mark set by the first load after signing in; see TAB_GUARD in
server.py).
