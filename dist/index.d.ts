/**
 * @heyharmony/design-system — design tokens from the Figma Harmony-2026 file.
 *
 * - Import the CSS once to register the custom properties:
 *     import "@heyharmony/design-system/css";
 * - Use the typed values / helpers from this module for programmatic access.
 */
export { themes, defaultTheme, themeVars, } from "./generated/tokens.js";
export type { Theme, ThemeSlug, ThemeVar, CssVar, } from "./generated/tokens.js";
import { type ThemeSlug, type CssVar } from "./generated/tokens.js";
/** The data-attribute used on the root element to select a theme. */
export declare const THEME_ATTRIBUTE = "data-theme";
/**
 * All CSS custom properties for the given theme as a `{ "--name": value }`
 * map with concrete, resolved values. Defaults to the default theme.
 */
export declare function getThemeVars(theme?: ThemeSlug): Record<CssVar, string>;
/** Read a single resolved token value for a theme (defaults to the default theme). */
export declare function getToken(name: CssVar, theme?: ThemeSlug): string | undefined;
/**
 * Apply a theme by setting `data-theme` on the target element
 * (defaults to `document.documentElement`). No-op outside the browser.
 */
export declare function setTheme(theme: ThemeSlug, element?: HTMLElement): void;
