/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#09090F",
        surface: "#0F1117",
        panel: "#161E2C",
        border: "#1E2B3C",
        muted: "#6B82A8",
        text: "#E2EAF8",
        accent: "#4F8EFF",
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
