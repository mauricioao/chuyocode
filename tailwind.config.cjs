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
        // High-contrast energetic accent: streaming yellow (shademanga
        // reference). Kept as DEFAULT/hover/soft so the 20+ existing
        // `accent-*` call sites don't break.
        accent: {
          DEFAULT: '#FACC15', // yellow-400
          hover: '#EAB308', // yellow-500
          soft: '#FDE047', // yellow-300
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
      boxShadow: {
        // Depth system (frontend-v3 design decision #9). The shademanga
        // reference conveys hierarchy with layered shadows + a hairline ring
        // instead of flat borders. Cards/rows pair these with `ring-1
        // ring-white/5`; higher levels lift more prominent surfaces.
        'elevation-1': '0 1px 2px 0 rgb(0 0 0 / 0.4)',
        'elevation-2': '0 4px 12px -2px rgb(0 0 0 / 0.5)',
        'elevation-3': '0 12px 32px -4px rgb(0 0 0 / 0.6)',
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
