# @heyharmony/design-system

Design tokens (themes, variables, colors) extracted from the Figma
**Harmony-2026** file and published as:

- **CSS custom properties** (`dist/css/tokens.css`) — `:root` defaults plus one
  `[data-theme="..."]` block per theme.
- **Typed TypeScript** (`dist/index.{js,cjs,d.ts}`) — token values, the theme
  list, and helpers, fully typed.
- **JSON** (`dist/tokens.json`) — resolved values per theme, for any tooling.

There is a single `Theme` collection with **15 themes**: semantic tokens
(`--surface-page`, `--text-primary`, `--tab-*`, `--composer-*`, `--dropdown-*`, …) across the
modes: `light` (default), `dark`, `white`, `black`, `doodles`, `ocean-light`,
`ocean-dark`, `ayu-light`, `ayu-dark`, `berry-light`, `berry-dark`,
`forest-light`, `forest-dark`, `sand-light`, `sand-dark`.

## Install

Installed straight from GitHub with pnpm — no registry needed. The package
builds itself on install via the `prepare` script.

```bash
pnpm add github:heyharmony/design-system
```

Pin to a specific tag/branch/commit if you want a stable version:

```bash
pnpm add github:heyharmony/design-system#v0.1.0
```

## Usage in a React / TypeScript app

### 1. Load the CSS once (e.g. in your app entry)

```ts
import "@heyharmony/design-system/css";
```

This registers every custom property. `:root` carries the default (`light`)
theme, so the variables work immediately.

### 2. Reference the variables in CSS

```css
.card {
  background: var(--surface-page);
  color: var(--text-primary);
  border: 1px solid var(--border-subtle);
}

.tab--active {
  background: var(--tab-bg-active);
  color: var(--tab-text-active);
}
```

### 3. Switch themes at runtime

Themes are activated by a `data-theme` attribute on the root element.

```tsx
import { setTheme, themes, defaultTheme, type ThemeSlug } from "@heyharmony/design-system";

function ThemePicker() {
  return (
    <select
      defaultValue={defaultTheme}
      onChange={(e) => setTheme(e.target.value as ThemeSlug)}
    >
      {themes.map((t) => (
        <option key={t.slug} value={t.slug}>
          {t.name}
        </option>
      ))}
    </select>
  );
}
```

`setTheme("dark")` sets `data-theme="dark"` on `document.documentElement`. Pass a
second argument to scope a theme to a subtree:

```ts
setTheme("ocean-dark", document.getElementById("panel")!);
```

### 4. Read resolved values programmatically

```ts
import { getToken, getThemeVars } from "@heyharmony/design-system";

getToken("--text-primary");          // default theme -> "#0a0a0a"
getToken("--text-primary", "dark");  // -> "#ffffff"

getThemeVars("dark");                // { "--surface-page": "#171717", ... }
```

All token names (`CssVar`), theme slugs (`ThemeSlug`) and values are typed, so
typos are caught at compile time.

## How tokens are extracted and built

The Figma variables `variables/local` REST endpoint requires an Enterprise
plan, so this package instead snapshots the variables through the Figma plugin
API and transforms that snapshot locally.

```
Figma (Harmony-2026)
  └─ scripts/figma-export.js          # Plugin API snippet, run via the Figma MCP
       └─ tokens/figma.raw.json       # committed snapshot (colors, modes, aliases)
            └─ scripts/figma-to-tokens.mjs   # -> build/tokens/*.json (W3C/Style Dictionary)
                 └─ style-dictionary.config.mjs  # -> dist/css/tokens.css, dist/tokens.json, src/generated/tokens.ts
                      └─ tsup                     # -> dist/index.{js,cjs,d.ts}
```

### Build

```bash
npm run build        # tokens -> css/json/ts -> bundle
```

Individual steps:

| Script             | Output                                                        |
| ------------------ | ------------------------------------------------------------- |
| `npm run tokens`   | `build/tokens/*.json` + `build/meta.json`                     |
| `npm run build:css`| `dist/css/tokens.css`, `dist/tokens.json`, generated TS data  |
| `npm run build:ts` | `dist/index.{js,cjs,d.ts}`                                     |

### Refreshing from Figma

`tokens/figma.raw.json` is a committed snapshot. To update it after the Figma
variables change, re-run the exporter snippet in
[`scripts/figma-export.js`](scripts/figma-export.js) against the Harmony-2026
file (fileKey `AA8bwpQKSB21xbeNgDR8wu`) via the Figma MCP `use_figma` tool, save
the returned JSON over `tokens/figma.raw.json`, then run `npm run build`.

## Notes

- Color values preserve Figma's exact hex (including 8-digit alpha such as
  `#ffffff66`).
- Alias variables (e.g. `--tab-bg-active`, `--composer-background`,
  `--dropdown-bg`) are emitted as `var(--…)` references in CSS to stay DRY, and as
  resolved concrete values in `tokens.json` / the TS API.
- The `--dropdown-*` group themes dropdown/select menus: `--dropdown-bg`,
  `--dropdown-border`, `--dropdown-option-bg-hover`,
  `--dropdown-option-bg-selected`, `--dropdown-option-text`,
  `--dropdown-option-text-selected`, `--dropdown-icon`. A matching **Dropdown**
  component (closed trigger + open menu with Default/Hover/Selected options) is
  published in the Figma file, bound to these variables.
