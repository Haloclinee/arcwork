# Design — arcwork

A locked design system for this app. Every page redesign reads this file before
emitting code. Do not regenerate per page — extend or amend this file when the
system needs to grow.

## Genre
modern-minimal

## Macrostructure family
- App pages (Jobs, Job detail, My jobs, Judges, Judge history, Reputation, Arena, Create job):
  bordered-nav + hairline-card app shell. No hero enrichment on app pages — function carries the page.
- The one marketing-flavoured surface (homepage hero above the job feed) uses an
  asymmetric title-left / code-card-right hero, per the Cobalt theme's signature move.

## Theme
Catalog theme: **Cobalt** — cool engineered near-white paper, one electric-cobalt
signal accent, hairline structure, Space Grotesk + Inter + system mono, tight 6–10px radii.
Chosen because arcwork is an on-chain, address-and-JSON-heavy dev-tool-adjacent product —
the "instrument panel" register fits far better than a generic SaaS gradient hero.

- `--color-paper`      oklch(98.5% 0.004 250)
- `--color-paper-2`    oklch(96.3% 0.006 252)
- `--color-paper-3`    oklch(93.5% 0.008 254)
- `--color-rule`       oklch(90%   0.008 255)
- `--color-rule-2`     oklch(82%   0.011 255)
- `--color-muted`      oklch(56%   0.013 255)
- `--color-ink-2`      oklch(38%   0.018 257)
- `--color-ink`        oklch(24%   0.020 258)
- `--color-accent`     oklch(58%   0.200 256)   — the one signal, <5% of any viewport
- `--color-accent-ink` oklch(99%   0.004 256)
- `--color-focus`      oklch(58%   0.200 256)
- `--color-graphite`   oklch(22%   0.018 260)   — the one dark band (code cards, Arena)

Semantic status colors (separate from the accent, per job status):
- Open → the accent itself
- Funded → oklch(62% 0.13 68) muted amber
- Completed → oklch(56% 0.13 155) muted green
- Rejected → oklch(58% 0.15 25) muted coral-red

Dark-mode (OS `prefers-color-scheme: dark`) inverts lightness within the same
hue family (258–260) rather than switching palettes — see `:root[data-theme]`
overrides in `src/index.css`.

## Typography
- Display: Space Grotesk, weight 600, tight tracking (-0.025em to -0.03em)
- Body: Inter, weight 400/500/600
- Mono: system stack (`ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace`)
  — used functionally for addresses, USDC amounts, status pills, job IDs. Not decorative.

## Spacing
4-point named scale (`--space-3xs` … `--space-3xl`) in `src/index.css`. Components
use named tokens, never raw px/rem values.

## Motion
- Easing: `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)`
- Durations: 150ms (hover/focus), 220ms (card lift, chat pop-in)
- Reveal pattern: none on app pages (function carries the page); a one-shot
  fade-up on the Jobs page card grid only.
- Reduced-motion: transitions collapse to none via `prefers-reduced-motion: reduce`.

## Microinteractions stance
- Silent success (no toasts for successful writes — the on-chain state itself is the confirmation).
- Button hover: 1px lift, no bounce/overshoot.
- Focus rings: instant, 2px solid accent, never animated in.

## CTA voice
- Primary: solid `--color-accent` fill, `--color-accent-ink` text, 6px radius (`--radius-pill`), never a pill/rounded-full shape.
- Secondary: transparent, `--color-rule-2` border, hover → accent border + accent text.

## What pages MUST share
- The wordmark (◠ arcwork) and brand-mark treatment (solid accent square, not a gradient).
- The accent colour and its restrained placement (CTA, active nav, focus rings, links only).
- Space Grotesk + Inter pairing, mono for all addresses/amounts/status text.
- Hairline borders as the only depth cue — no glow, no gradient fills, no drop-shadow beyond a 1px lift.
- The `pill-*` status colour mapping (Open/Funded/Submitted/Completed/Rejected/Expired).

## What pages MAY differ on
- Whether they show the code-card hero motif (only the Jobs page, above the feed).
- The single dark graphite band — only the Arena page carries a full dark surface;
  every other page stays light throughout.

## Anti-patterns banned project-wide
- Purple-to-pink/cyan neon gradients and glow shadows (the previous design's signature — explicitly what this redesign replaced).
- Gradient text, glassmorphism, pure `#000`/`#fff`.
- Decorative emoji as UI chrome (kept only where functionally load-bearing, e.g. a chat icon on a single button).
