module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        display: ['"Space Grotesk"', "Inter", "sans-serif"],
        serif: ['"Instrument Serif"', "Georgia", "serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      opacity: {
        2: "0.02",
        4: "0.04",
        6: "0.06",
        8: "0.08",
        12: "0.12",
      },
      colors: {
        // Violet → Lime fusion on near-black.
        // (These were named -blue and -gold before a palette swap left the
        // names pointing at the wrong colours. Named for what they are now.)
        "stratum-darker": "#0a0a12", // near-black base
        "stratum-dark": "#14121f", // elevated surface
        "stratum-lime": "#a3e635", // lime — secondary / energy
        "stratum-violet": "#8b5cf6", // electric violet — primary accent
      },
      backgroundImage: {
        // Near-black with a violet glow from the top and a lime glow in the corner.
        "gradient-stratum":
          "radial-gradient(120% 80% at 50% -10%, rgba(139,92,246,0.14), transparent 55%), radial-gradient(70% 60% at 85% 0%, rgba(163,230,53,0.08), transparent 50%)",
      },
    },
  },
  plugins: [],
}
