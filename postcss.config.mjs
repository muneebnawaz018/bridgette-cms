/** @type {import('postcss-load-config').Config} */
// Tailwind was scaffolded in by create-next-app and never used: the UI is MUI throughout,
// and the only classes in the codebase (rise-in, tnum, avatar-edit) are hand-written in
// globals.css. Its reset also duplicated MUI's CssBaseline. Removed.
const config = {
  plugins: {
    autoprefixer: {},
  },
};

export default config;
