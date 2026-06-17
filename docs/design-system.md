# Design system

Internal reference for UI tokens and patterns. Official Geist docs:

- [Colors](https://vercel.com/geist/colors)
- [Typography](https://vercel.com/geist/typography)
- [Materials](https://vercel.com/geist/materials)

Polish checklist: [`.agents/skills/make-interfaces-feel-better/SKILL.md`](../.agents/skills/make-interfaces-feel-better/SKILL.md)

## Theme

Minimal **light mode only**. White page background, gray surfaces, accent colors for status only.

## Fonts

Loaded from the [`geist`](https://www.npmjs.com/package/geist) npm package via `app/assets/css/fonts.css`:

| Family | File | CSS variable |
|--------|------|--------------|
| Geist Sans | `geist/dist/fonts/geist-sans/Geist-Variable.woff2` | `--font-geist-sans` |
| Geist Mono | `geist/dist/fonts/geist-mono/GeistMono-Variable.woff2` | `--font-geist-mono` |

## Color tokens

See `app/assets/css/tokens.css`. Map Geist gray scale to:

| Token | Geist role | Usage |
|-------|------------|-------|
| `--background-1` | Background 1 | Page canvas |
| `--background-2` | Background 2 | Review list area |
| `--gray-1`–`3` | Component bg/hover/active | Rows, inputs |
| `--gray-4`–`5` | Borders / focus | Input rings |
| `--gray-9` | Secondary text | Hints, metadata |
| `--gray-10` | Primary text | Headings, labels |

Status: `--green-*` matched, `--amber-*` ambiguous, `--red-*` errors.

## Typography

Utility classes in `app/assets/css/typography.css` mirror Geist scale (`text-heading-*`, `text-label-*`, `text-copy-*`, `text-button-*`).

## Materials

`material-base`, `material-small`, `material-menu` in `app/assets/css/materials.css`.

## Components

| Component | Surface | Notes |
|-----------|---------|-------|
| `TidalConnect` | `material-base` | Connect step card |
| `InputPanel` | `input-field` | Textarea + image thumbs |
| `TrackRow` | `material-base` | Concentric radii on art |
| `MatchReview` footer | `material-menu` | Sticky create bar |
