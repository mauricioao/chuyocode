/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}'],
  // Dark mode is toggled by a `dark` class on <html> (design decision #9),
  // set by an inline no-flash script before first paint.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Base surface: "modo oscuro" that avoids the boring pure-black look.
        // Zinc-950 anchors the palette per the PRD identity notes.
        base: {
          DEFAULT: '#09090b', // zinc-950
          soft: '#18181b', // zinc-900
          muted: '#27272a', // zinc-800
        },
        // High-contrast Andean accent: orange / terracotta (chullo reference).
        // NOTE: kept as-is (DEFAULT/hover/soft/terracotta) so the 20+ existing
        // `accent-*` call sites don't break — decision #2 is ADDITIVE only.
        accent: {
          DEFAULT: '#ea580c', // orange-600
          hover: '#c2410c', // orange-700
          soft: '#fb923c', // orange-400
          terracotta: '#b45309', // amber-700 / red-earth
        },
        // Andean identity palette (design decision #2) — new top-level tokens,
        // siblings of `accent`, so headings/patterns/section accents can pull
        // from a warm earth range without restructuring `accent`.
        terracotta: {
          DEFAULT: '#b45309', // amber-700 — red-earth
          soft: '#d97706', // amber-600
          hover: '#92400e', // amber-800
        },
        ocre: {
          DEFAULT: '#ca8a04', // yellow-600 — ochre clay
          soft: '#eab308', // yellow-500
          hover: '#a16207', // yellow-700
        },
        amaranto: {
          DEFAULT: '#be123c', // rose-700 — amaranth / kiwicha bloom
          soft: '#e11d48', // rose-600
          hover: '#9f1239', // rose-800
        },
      },
      fontFamily: {
        // Display face for headings (decision #1). Fraunces Variable loads via
        // fonts.css; Georgia/serif is the swap fallback. `sans` mirrors
        // Tailwind's default system stack so body copy stays web-font-free.
        display: ['Fraunces Variable', 'Georgia', 'serif'],
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      transitionProperty: {
        // Smooth theme transitions (spec 6: CSS transition <= 300ms).
        theme: 'background-color, border-color, color, fill, stroke',
      },
      transitionDuration: {
        theme: '300ms',
      },
    },
  },
  plugins: [],
};
