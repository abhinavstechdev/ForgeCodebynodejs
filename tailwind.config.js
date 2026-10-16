/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./client/index.html",
    "./client/src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        editor: {
          bg: '#18181b',
          sidebar: '#1f1f23',
          activity: '#121214',
          border: '#27272a',
          accent: '#3b82f6',
          hover: '#2a2b30',
          active: '#313238',
          text: '#d4d4d8',
          muted: '#71717a',
        },
        diff: {
          addedBg: '#132e1b',
          addedBorder: '#2ea043',
          addedGutter: '#3fb950',
          deletedBg: '#371317',
          deletedBorder: '#f85149',
          deletedGutter: '#f85149',
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
