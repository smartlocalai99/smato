// A theme color backed by one of the CSS custom properties in globals.css.
// Tailwind can't fade a bare var() by itself, so a class with an opacity
// modifier (bg-red/10, border-green/35) used to generate nothing at all —
// every tint and colored outline in the admin silently went missing. Those
// now mix the color with transparent instead. Plain classes (bg-amber,
// text-red) still get the bare var(), so they never depend on color-mix().
function themeColor(name) {
  return ({ opacityValue }) =>
    opacityValue === undefined || String(opacityValue).startsWith("var(")
      ? `var(--${name})`
      : `color-mix(in srgb, var(--${name}) calc(${opacityValue} * 100%), transparent)`;
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
    // lib/autoStatus.js hands out the status dot, glow and border classes.
    "./lib/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      // Colors read from the existing CSS custom properties in globals.css,
      // not hardcoded here — .console/.signin already override these
      // variables for the light admin theme, so bg-ink/text-text/etc. keep
      // working correctly in both themes with zero extra config.
      colors: {
        ink: themeColor("ink"),
        panel: themeColor("panel"),
        "panel-2": themeColor("panel-2"),
        line: themeColor("line"),
        text: themeColor("text"),
        "text-dim": themeColor("text-dim"),
        "text-faint": themeColor("text-faint"),
        amber: themeColor("amber"),
        "amber-dim": themeColor("amber-dim"),
        "on-amber": themeColor("on-amber"),
        teal: themeColor("teal"),
        green: themeColor("green"),
        red: themeColor("red"),
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        DEFAULT: "var(--radius)",
      },
    },
  },
  plugins: [],
};
