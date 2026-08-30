/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      // Colors read from the existing CSS custom properties in globals.css,
      // not hardcoded here — .console/.signin already override these
      // variables for the light admin theme, so bg-ink/text-text/etc. keep
      // working correctly in both themes with zero extra config.
      colors: {
        ink: "var(--ink)",
        panel: "var(--panel)",
        "panel-2": "var(--panel-2)",
        line: "var(--line)",
        text: "var(--text)",
        "text-dim": "var(--text-dim)",
        "text-faint": "var(--text-faint)",
        amber: "var(--amber)",
        "amber-dim": "var(--amber-dim)",
        "on-amber": "var(--on-amber)",
        teal: "var(--teal)",
        green: "var(--green)",
        red: "var(--red)",
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
