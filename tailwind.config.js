/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // hex (same values as src/styles/tokens.css) so opacity modifiers such as bg-warn/10 work
      colors: {
        canvas: '#09090b',
        panel: '#121215',
        well: '#18181b',
        line: 'var(--mx-line)',
        ok: '#10b981',
        warn: '#f59e0b',
        crit: '#ef4444',
        accent: '#38bdf8',
      },
      fontFamily: {
        sans: ['Inter Variable', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Cascadia Mono', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
