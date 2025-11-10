/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./providers/**/*.{js,jsx,ts,tsx}",
    "./theme/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        light: {
          bg: "#FFFFFF",
          surface: "#F7F7F8",
          text: "#0B1220",
          subtext: "#495466",
          border: "#E6E8EC",
        },
        dark: {
          bg: "#1d283d",
          surface: "#0F172A",
          text: "#E5E7EB",
          subtext: "#9CA3AF",
          border: "#1F2937",
        },
        primary: "#0B1220",
        secondary: "#495466",
        danger: "#F43F5E",
      },
        // Optional rounded/sizing tweaks
      borderRadius: {
        xl: "14px",
        "2xl": "18px",
      },
    },
  },
  plugins: [],
};
