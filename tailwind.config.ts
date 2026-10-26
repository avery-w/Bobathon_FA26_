import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        obsidian: {
          950: "#06080F",
          900: "#0B0F19",
          850: "#101626",
          800: "#161E33",
          700: "#24304D",
        },
      },
    },
  },
  plugins: [],
};
export default config;
