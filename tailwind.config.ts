import type { Config } from 'tailwindcss';
import { colors } from './src/lib/colors';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  // Preflight is disabled so Tailwind's CSS reset does not fight MUI's baseline.
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        brand: colors.brand,
      },
    },
  },
  plugins: [],
};

export default config;
