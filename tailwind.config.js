/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--mx-canvas)',
        panel: 'var(--mx-panel)',
        well: 'var(--mx-panel-2)',
        line: 'var(--mx-line)',
        ok: 'var(--mx-ok)',
        warn: 'var(--mx-warn)',
        crit: 'var(--mx-crit)',
        accent: 'var(--mx-accent)',
      },
      fontFamily: {
        sans: ['Inter Variable', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Cascadia Mono', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
