/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/scraper-ui/**/*.{js,jsx,html}'],
  theme: {
    extend: {
      colors: {
        // Align with variables.css (dark theme)
        'do-bg-primary': '#0f172a',
        'do-bg-secondary': '#1e293b',
        'do-bg-tertiary': '#334155',
        'do-accent': '#38bdf8',
        'do-accent-hover': '#0ea5e9',
        'do-text': '#ffffff',
        'do-text-secondary': '#cbd5e1',
        'do-text-muted': '#94a3b8',
        'do-success': '#22c55e',
        'do-warning': '#f59e0b',
        'do-danger': '#ef4444',
        'do-border': '#334155',
      },
    },
  },
  plugins: [],
};
