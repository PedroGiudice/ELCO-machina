/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./**/*.{ts,tsx}",
    "!./node_modules/**",
    "!./src-tauri/**",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
