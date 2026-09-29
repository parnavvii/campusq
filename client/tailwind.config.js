/** Waitwell design tokens — warm paper, sage, apricot and butter; soft shapes. */
const sage = { DEFAULT: '#557A66', deep: '#3D5B4B', soft: '#E4EDE6', tint: '#F1F6F2' };
const apricot = { DEFAULT: '#E39C74', deep: '#A5582F', soft: '#FBE9DE' };
const rose = { DEFAULT: '#C8695A', deep: '#93473B', soft: '#F8E5E0' };

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F7F3ED', // page background
        cream: '#FFFDF9', // cards and surfaces
        ink: { DEFAULT: '#2F2A26', soft: '#4B443E', muted: '#80766D' },
        line: '#EBE3D8',
        sage,
        apricot,
        butter: { DEFAULT: '#F1D78C', soft: '#FBF3DA', deep: '#7A5E14' },
        rose,
        // Semantic names used by status pills and alerts.
        go: sage, // served, open, your turn
        signal: apricot, // highlights, "now serving"
        stop: rose, // paused, errors, skipped
      },
      fontFamily: {
        sans: ['"Figtree Variable"', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        serif: ['"Fraunces Variable"', 'Georgia', 'Cambria', 'serif'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(47,42,38,0.04), 0 10px 30px -18px rgba(47,42,38,0.22)',
        lift: '0 2px 4px rgba(47,42,38,0.05), 0 22px 44px -22px rgba(47,42,38,0.32)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
};
