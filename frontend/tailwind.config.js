/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "#ffffff",
        base: "#f5f5f4",
        border: "#e7e5e4",
        muted: "#78716c",
        text: "#1c1917",
        accent: "#0ea5e9",
      },
    },
  },
  plugins: [],
};
