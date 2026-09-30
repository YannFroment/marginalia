---
name: "Marginalia studio"
description: "A flat, dense, high-contrast reading desk for machine-written code reviews."
colors:
  canvas-dark: "oklch(14.1% 0.005 285.823)"
  surface-dark: "oklch(21% 0.006 285.885)"
  line-dark: "oklch(27.4% 0.006 286.033)"
  text-dark: "oklch(96.7% 0.001 286.375)"
  text-muted-dark: "oklch(70.5% 0.015 286.067)"
  canvas-light: "oklch(98.5% 0)"
  surface-light: "#ffffff"
  line-light: "oklch(92% 0.004 286.32)"
  text-light: "oklch(21% 0.006 285.885)"
  text-muted-light: "oklch(44.2% 0.017 285.786)"
  text-subtle: "oklch(55.2% 0.016 285.938)"
  signal-blue: "oklch(62.3% 0.214 259.815)"
  signal-blue-action: "oklch(54.6% 0.245 262.881)"
  changes-red-light: "oklch(57.7% 0.245 27.325)"
  changes-red-dark: "oklch(70.4% 0.191 22.216)"
  approved-green-light: "oklch(59.6% 0.145 163.225)"
  approved-green-dark: "oklch(76.5% 0.177 163.223)"
  important-amber-light: "oklch(55.5% 0.163 48.998)"
  important-amber-dark: "oklch(87.9% 0.169 91.605)"
  semantic-violet-light: "oklch(49.1% 0.27 292.581)"
  semantic-violet-dark: "oklch(81.1% 0.111 293.571)"
typography:
  display:
    fontFamily: "ui-sans-serif, -apple-system, 'Inter', 'Segoe UI', system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: "1.2"
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "ui-sans-serif, -apple-system, 'Inter', 'Segoe UI', system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: "1.3"
    letterSpacing: "-0.025em"
  title:
    fontFamily: "ui-sans-serif, -apple-system, 'Inter', 'Segoe UI', system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: "1.4"
  body:
    fontFamily: "ui-sans-serif, -apple-system, 'Inter', 'Segoe UI', system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.43"
  label:
    fontFamily: "ui-sans-serif, -apple-system, 'Inter', 'Segoe UI', system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: "1.33"
  prose:
    fontFamily: "'Recursive Variable', ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "1.75"
  code:
    fontFamily: "ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace"
    fontSize: "0.85em"
    fontWeight: 400
rounded:
  md: "6px"
  lg: "8px"
  xl: "12px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  card:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.text-dark}"
    rounded: "{rounded.xl}"
    padding: "16px"
  stat-tile:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.text-dark}"
    rounded: "{rounded.xl}"
    padding: "12px 16px"
  button-primary:
    backgroundColor: "{colors.signal-blue-action}"
    textColor: "#ffffff"
    rounded: "{rounded.lg}"
    padding: "6px 12px"
    typography: "{typography.body}"
  button-secondary:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.text-dark}"
    rounded: "{rounded.lg}"
    padding: "6px 12px"
    typography: "{typography.body}"
  badge:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.text-muted-dark}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
    typography: "{typography.label}"
  nav-tab:
    backgroundColor: "{colors.canvas-dark}"
    textColor: "{colors.text-dark}"
    height: "40px"
    typography: "{typography.body}"
  input:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.text-dark}"
    rounded: "{rounded.lg}"
    padding: "6px 10px"
    typography: "{typography.body}"
---

# Design System: Marginalia studio

## Overview

**Creative North Star: "The Reading Desk"**

Marginalia's studio is where a person sits down to read what a machine wrote about someone else's code. The desk is the review; everything around it (the bar, the tabs, the sidebar) is furniture that stays out of the way and tells the truth about state. The voice is crisp, high-contrast and technical: firm edges, strong status colors, no ornament. Nothing here is decorative, and nothing is playful.

Density is deliberate. Controls are small and close (14px and 12px type, 6–12px padding), because the job is to hold many reviews in view and move between them fast. Surfaces are flat and separated by one-pixel lines, so hierarchy comes from tone and type weight rather than from shadow. The single loud thing on any screen is a status: a verdict, a count, an unread dot.

**Key Characteristics:**
- Flat surfaces with thin borders; depth is tonal, shadows are rare and reactive.
- Cool graphite neutrals and one signal blue reserved for selection, unread, focus and the main action.
- Status is always double-coded: color plus icon or text, never color alone.
- Dense by default, comfortable on touch: controls reach 44px only on coarse pointers.
- Two type voices: a system sans for the interface, Recursive for the review text itself.
- Confirmed rejection: consumer-app playfulness (very round corners, bright color, illustration, cheerful tone).

## Colors

Graphite neutrals and one signal blue, with four status hues. Both themes are composed, not inverted: dark is the daily-driver.

### Primary
- **Signal Blue** (oklch(62.3% 0.214 259.815)): selection, the unread dot, keyboard focus rings and the active-tab rule. The filled primary button uses its stronger sibling **Action Blue** (oklch(54.6% 0.245 262.881)), and there is only one such button in view at a time (Post comment).

### Secondary
- **Changes Red** (oklch(57.7% 0.245 27.325) light / oklch(70.4% 0.191 22.216) dark): "Request changes" verdicts, critical findings, failures.
- **Approved Green** (oklch(59.6% 0.145 163.225) light / oklch(76.5% 0.177 163.223) dark): "Approve" verdicts and the posted-comment check.
- **Important Amber** (oklch(55.5% 0.163 48.998) light / oklch(87.9% 0.169 91.605) dark): "important" findings.

### Tertiary
- **Semantic Violet** (oklch(49.1% 0.27 292.581) light / oklch(81.1% 0.111 293.571) dark): the semantic-typography toggle and the triage label; the only place the app is allowed to be "expressive".

### Neutral
- **Graphite Canvas** (oklch(14.1% 0.005 285.823) dark / oklch(98.5% 0) light): the page.
- **Graphite Surface** (oklch(21% 0.006 285.885) dark / #ffffff light): cards, panels, modals, inputs.
- **Hairline** (oklch(27.4% 0.006 286.033) dark / oklch(92% 0.004 286.32) light): every border and divider.
- **Ink / Bone** (oklch(21% 0.006 285.885) light / oklch(96.7% 0.001 286.375) dark): primary text.
- **Muted Text** (oklch(44.2% 0.017 285.786) light / oklch(70.5% 0.015 286.067) dark): secondary copy, exposed as `--fg-muted` (text-fg-muted); at least 6:1 on the canvas and on cards in both themes.
- **Subtle Mark** (oklch(55.2% 0.016 285.938)): `--fg-subtle`, for icons and non-text marks only (3:1), never for sentences.

### Named Rules
**The Signal Rule.** Blue is a signal, not a mood. If it is not selection, unread, focus or the one primary action, it is not blue.
**The Double-Code Rule.** A status is never carried by color alone: pair it with an icon, a word or a shape (verdict badges do all three).
**The Muted-Text Rule.** Secondary sentences use `text-fg-muted`; raw `zinc-500` is 3.7–4.1:1 on dark surfaces and fails AA, so it never sets a sentence.

## Typography

**Interface Font:** the system sans stack (`ui-sans-serif, -apple-system, Inter, Segoe UI, system-ui`)
**Review Font:** Recursive Variable (weight and slant axes only), falling back to the system sans
**Mono Font:** `ui-monospace, SF Mono, JetBrains Mono, Menlo`, for code, paths and ids

**Character:** a neutral, native-feeling interface that disappears, with a slightly more characterful face reserved for the text people actually read. The semantic-typography layer (semfont) modulates that face by meaning: color for sentiment, weight and size for importance, slant for hedging. It is on by default and can be switched off.

### Hierarchy
- **Display** (600, 1.875rem, tight −0.025em): the Home page title only.
- **Headline** (600, 1.5rem, tight −0.025em): a review's title.
- **Title** (500, 1rem): section headings inside a review (real `h2`s wrapping the collapsible triggers) and dialog titles.
- **Body** (400, 0.875rem, 1.43): the interface: buttons, list rows, card text.
- **Label** (400, 0.75rem): metadata, counts, timestamps, keyboard hints.
- **Prose** (400, 1rem, 1.75, Recursive, measure capped at 80ch): the review text.

### Named Rules
**The Two Voices Rule.** The interface speaks in the system sans; only review prose may use Recursive. Mono is for code, paths and ids, never a costume.
**The Long-Word Rule.** Review text contains unbroken paths and identifiers; prose sets `overflow-wrap: anywhere`, and nothing in a card may push past its border.

## Layout

A sticky chrome of two rows (a 3.5rem top bar and a 2.5rem strip of open reviews, 3rem on touch) sits over a flexible body. The body is a card grid on Home (1–5 columns depending on card size and width; small, medium, large) and a reader on a review: article capped at 80ch, with an optional 16rem side panel for details and contents. A left sidebar (18rem) lists every review but only exists while a review is open; Home is itself the list. Spacing rhythm is Tailwind's 4px base: 8px inside compact controls, 12px between related items, 16px card padding, 24px page gutters.

The chrome height is a token (`--chrome-h`, `--strip-h`) that grows on coarse pointers, and everything pinned beneath it reads the variable. Open reviews behave like browser tabs: they start at 14rem wide, shrink together as more open, drop to an icon below ~96px, and animate in and out.

## Elevation & Depth

Flat by default. Depth is tonal: canvas, then surface, separated by a one-pixel hairline. Shadows are a response, not a resting state: a card gains `shadow-sm` on hover, and only modal surfaces (command palette, post confirmation) carry a large soft shadow.

### Shadow Vocabulary
- **Hover lift** (`box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)`): a review card under the pointer.
- **Modal** (`box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25)`): dialogs over a 40–50% black scrim.

### Named Rules
**The Flat-By-Default Rule.** No surface has a resting shadow. If a shadow appears, something is hovered or something is on top.

## Shapes

Moderate, consistent corners: 6px on small marks, 8px on controls and inputs, 12px on cards, panels and modals; full pills only for badges and counters. Borders are 1px hairlines. Never rounder than 12px on a container: very round corners read as a consumer app, which is a confirmed rejection.

## Components

### Buttons
- **Shape:** 8px radius, 6px 12px padding, 14px type (`rounded-lg`).
- **Primary:** Action Blue fill, white text; one per view (Post comment). Disabled at 60% opacity.
- **Secondary:** 1px hairline border on the surface color, no fill change until hover (`zinc-50` / `zinc-800`).
- **Hover / Focus:** hover is a tonal shift only; focus is the native focus ring, plus a 2px Signal Blue ring on text inputs. On coarse pointers every control reaches 44px.

### Stat tiles
- **Style:** a 12px-radius surface with a hairline, a 24px semibold count in the status color and a 12px muted label. The tile is a filter: pressed state fills with a 10% tint of its status hue and a 50% border. A tile at zero is disabled.

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** Graphite Surface with a hairline; nothing nested inside another card.
- **Shadow Strategy:** see Elevation: hover only.
- **Internal Padding:** 16px (12px in the small size).
- **Content by size:** small shows number, title and verdict icon; medium adds counts and author; large adds branch, an overview and the top findings.

### Inputs / Fields
- **Style:** 8px radius, hairline border, surface fill; the filter field is a bordered row whose whole width is the input.
- **Focus:** border and a 2px ring in Signal Blue at 50%; the command-palette input uses an inset 2px Signal Blue outline.

### Navigation
- **Open-review strip:** a `nav` of links, active one marked with `aria-current` and a 2px top rule in the verdict color (green or red); each carries a state icon (spinner for in progress, clock for waiting, triangle for failed, else the verdict), an unread dot and a close button that appears on hover or when active.
- **Sidebar:** grouped list (Needs changes, Approved, Triage, Retro) with the same icons; an unread review is set in medium weight.

### Dialogs
Command palette and post confirmation are true modal dialogs: focus moves in, Tab wraps, Escape closes and focus returns to the opener. The confirmation puts focus on Cancel, the safe action.

### Motion

Motion explains state and continuity, and stays short. Cards glide between sizes with a layout animation (0.5s, `cubic-bezier(0.4, 0, 0.2, 1)`); tabs grow in and out over 0.22s; extra card content fades in only once the card is nearly in place. With `prefers-reduced-motion`, travel disappears (instant resize, no smooth scroll, spinners become a soft pulse) while state changes and opacity stay.

## Do's and Don'ts

### Do:
- **Do** use `text-fg-muted` for secondary sentences and `text-fg-subtle` only for icons.
- **Do** pair every status color with an icon or word.
- **Do** keep controls compact for mouse and let `touch-target` raise them to 44px on coarse pointers.
- **Do** wrap any new modal in the shared focus handling (`useModalFocus`) and scroll lock.
- **Do** give any new animation a `prefers-reduced-motion` path that keeps the state change.

### Don't:
- **Don't** make it playful: no very round corners, bright decorative color, illustration or cheerful copy (the confirmed rejection).
- **Don't** add a resting shadow, a gradient, or a glass surface.
- **Don't** use blue for anything but selection, unread, focus and the one primary action.
- **Don't** set sentences in `zinc-500` on dark surfaces.
- **Don't** nest cards, or let long identifiers push past a container's border.
