---
status: Draft
author: -
created: 2026-05-08
updated: 2026-05-08
supersedes: -
superseded-by: -
---

# 016 — Accessibility, theming & i18n

## Summary

Bring the web app to a baseline of **WCAG 2.2 AA**, ship a real **theme system** (light / dark / high-contrast, plus a "code-editor-like" theme), and lay an **i18n** foundation with a typed catalog (`en` shipped; structure ready for `ja`, `zh`, `de`). All three concerns are orthogonal in user terms but share the same architectural footprint — a single `<AppShell>` provider, a single source of typography/spacing tokens, and a single `t()` function — so they ship together.

## Motivation

The current Next.js app has a single colour palette baked into Tailwind utilities, a few `dark:` hints scattered inconsistently, no `prefers-reduced-motion` handling, and no localisation seam. As the feature surface grows (achievements, races, drills, leaderboards) every new component will compound the inconsistency unless the platform layer lands first.

What's already there to leverage:

- `web/src/app/layout.tsx` is a clean place to mount providers.
- Tailwind is already in use — themes can be CSS-variable-driven without changing utility names.
- Most copy lives in a handful of components — extraction to a catalog is mechanical.

## Goals

- Visual: all text passes 4.5:1 contrast (3:1 for ≥18px); focus states visible on every interactive element; tap-targets ≥44 px on mobile.
- Motion: respect `prefers-reduced-motion: reduce` — disable caret pulse, snippet slide-in, toast bounce.
- Keyboard: every flow (sign-in → daily → play → submit → settings) operable without mouse; visible focus order; "skip to content" link.
- Theming: 4 themes (`system`, `light`, `dark`, `high-contrast`) selectable from settings; persisted in localStorage for guests, on profile for signed-in.
- i18n: every user-visible string passes through `t(key, vars)`; `en` complete; `ja` / `zh` / `de` stubs.
- Bundle: provider + catalog ≤ 6 KB gzipped over current.

## Non-goals

- Not WCAG AAA. AA is the bar.
- Not RTL layout v1 (none of the seeded languages need it). Architecture allows it; layouts use logical properties (`ms-`, `me-`, `ps-`, `pe-`).
- Not full visual design overhaul. Existing layouts stay; tokens and contrast change.

## Design

### Tokens & themes

Tokens live in `web/src/styles/tokens.css` as CSS custom properties scoped per theme:

```css
:root, [data-theme="light"] {
  --bg: #ffffff;
  --fg: #0b0c0f;
  --fg-muted: #4a5160;
  --accent: #2351ff;
  --good: #167b3a;
  --bad:  #c0392b;
  --code-bg: #f3f4f7;
  --focus-ring: #2351ff;
  /* type scale, spacing, radii, shadows */
}
[data-theme="dark"] { --bg: #0c0e12; --fg: #f5f6fa; ... }
[data-theme="hc"]   { --bg: #000;     --fg: #fff;    --accent: #ffd400; ... }
[data-theme="editor"] { --bg: #1e1e1e; ... }   /* monaco-ish */
```

Tailwind reads them via theme extension:

```ts
// web/tailwind.config.ts
theme: { extend: { colors: { bg: "var(--bg)", fg: "var(--fg)", accent: "var(--accent)", ... } } }
```

So existing `bg-bg text-fg` utilities just work; switching themes only flips a `data-theme` attribute.

### `<AppShell>` provider

```tsx
<AppShell theme={...} reducedMotion={...} locale={...}>
  {children}
</AppShell>
```

Responsibilities:

- Reads stored theme + locale from localStorage (guest) or profile (signed-in) once on mount; sets `data-theme` and `lang` on `<html>` to avoid FOUC.
- Subscribes to `matchMedia("(prefers-color-scheme: dark)")` and `(prefers-reduced-motion: reduce)`.
- Exposes `useTheme()`, `useT()`, `useReducedMotion()` hooks via context.
- Persists changes back through the right channel (localStorage or `PUT /profile`).

### Reduced motion

A single utility `motion-safe:` / `motion-reduce:` on every animated class — paired with a global rule:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .001ms !important; transition-duration: .001ms !important; }
}
```

Specific carve-outs (the typing caret) use `useReducedMotion()` and degrade to a non-animated equivalent.

### Keyboard & focus

- Every button/link uses semantic elements; no `div role=button`.
- A global `focus-visible:ring-2 ring-focus-ring ring-offset-2 ring-offset-bg` utility on a base layer applies to all interactive elements.
- "Skip to content" link in `<AppShell>` focuses the main `<main id="content" tabindex="-1">`.
- Modal/dialog components (settings, race lobby) trap focus and restore on close — implemented via Radix primitives.

### i18n

```
web/src/i18n/
  index.ts           # t(key, vars), useT()
  catalogs/
    en.ts            # source of truth, typed
    ja.ts | zh.ts | de.ts   # partial stubs; missing keys fall back to en
```

Catalog shape:

```ts
export const en = {
  "play.start": "Start typing to begin",
  "result.wpm": "{n} WPM",
  "race.lobby.waiting": "Waiting for {count, plural, one {# player} other {# players}}",
  "achievement.streak-7.title": "Week On",
  "achievement.streak-7.desc": "Maintain a 7-day streak",
} as const;
export type CatalogKey = keyof typeof en;
```

`t(key, vars)` is typed so a missing key fails the build. ICU pluralisation handled by `intl-messageformat` (≈4 KB). Numbers, dates, lists go through `Intl.*` directly — no extra deps.

### Profile additions

```ts
type Profile = {
  // existing
  // new
  theme?: "system" | "light" | "dark" | "hc" | "editor";
  reduced_motion?: "system" | "always" | "never";
  locale?: string;          // BCP-47, e.g. "en-GB"
};
```

(Spec 005's `handle`, `leaderboard_optin` continue to coexist.)

### Snippet rendering & a11y nuance

- Each character in the live typing area is `<span>` — but the wrapping `<pre role="textbox" aria-label="snippet input">` is the *single* announced control. Per-char spans are `aria-hidden`.
- Live error count and WPM use `aria-live="polite"` regions, throttled to once/sec to avoid screen-reader spam.
- Screen-reader users opt into a "verbose" mode in settings: announces incorrect characters via a polite live region; off by default to avoid noise.

### Invariants preserved

- No backend changes except optional profile fields; existing handlers untouched.
- Keystroke timeline (spec 007) unchanged.
- Server-side WPM/streak unchanged.

## Alternatives considered

1. **Tailwind `dark:` only, no tokens.** Works for dark mode; falls apart for high-contrast and editor themes. Tokens are the right substrate.
2. **`react-intl` / FormatJS full toolkit.** Powerful but heavy; we use only the message format helper.
3. **`next-themes` for theme switching.** Adds a dependency for ~30 lines of code. Inline our own.
4. **Postpone i18n.** Cheap to add now, expensive to retrofit when copy is scattered across 30 components.

## Risks & mitigations

- **FOUC on theme load.** Mitigation: a tiny inline script in `layout.tsx` reads localStorage and sets `data-theme` *before* React hydrates.
- **Translation drift.** Stub catalogs miss keys. Mitigation: a lint rule (`scripts/check-i18n.ts`) compares each catalog against `en.ts`; CI fails if the prod catalog (`en`) has missing keys; non-en catalogs only warn.
- **Contrast regressions** on theme tweaks. Mitigation: a Playwright + axe-core test runs on the four canonical pages × four themes (= 16 combinations); fails on any AA violation.
- **Bundle bloat.** Mitigation: catalogs lazy-loaded — `en` is in the main bundle, others fetched on demand and cached.

## Implementation appendix

### New files

```
web/src/styles/tokens.css
web/src/components/AppShell.tsx
web/src/lib/theme.ts
web/src/lib/reduced-motion.ts
web/src/i18n/index.ts
web/src/i18n/catalogs/{en,ja,zh,de}.ts
scripts/check-i18n.ts
```

### Component touchpoints

- `web/src/app/layout.tsx`: mount `<AppShell>`, inject inline theme-bootstrap script, `<a href="#content" class="skip-link">` first.
- All buttons → ensure `<button type="button">`, focus utilities, no removed outlines.
- `Snippet.tsx`: revisit ARIA wrapping per above.
- `ResultCard.tsx`: live regions; verbose-mode hook.
- Settings page (new): theme + motion + locale toggles, persisted via `useTheme`/`useT`.

### CDK / build

- No infra change.
- Add `axe-core/playwright` and `@playwright/test` as dev deps if not present (likely present already from spec 007's replay test).

### Test plan

- **Axe + Playwright matrix:** for `/`, `/play`, `/history`, `/leaderboard` × `light/dark/hc/editor` → expect zero AA violations.
- **Keyboard walkthrough:** scripted Playwright run with `keyboard.press('Tab')` only, completes a guest → daily → finish → see-result flow without using `mouse.click`.
- **Reduced motion:** Playwright with `forcedColors: 'active'` + `reducedMotion: 'reduce'` — assert caret element has no animation.
- **i18n:** unit test `t("play.start")` returns en string; `t("missing.key")` throws in dev build, returns key in prod.
- **Lint catalog parity:** `bun run scripts/check-i18n.ts` exits 0 on parity, 1 on drift.
- **Visual regression:** snapshot dashboard + result card across all four themes.
