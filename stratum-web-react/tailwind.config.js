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
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        // --- Surfaces -------------------------------------------------------
        // A real ramp instead of stacked white/[0.0x] overlays. Higher number =
        // more elevated. `ink` is the page floor; everything else sits on it.
        ink: {
          DEFAULT: "#08080A", // page background
          1: "#0E0E11", // resting card
          2: "#15151A", // raised card / popover
          3: "#1D1D23", // hover, pressed, input wells
        },

        // --- Lines ----------------------------------------------------------
        hairline: {
          DEFAULT: "rgba(255,255,255,0.07)", // default divider
          strong: "rgba(255,255,255,0.13)", // emphasis, focus
        },

        // --- Accent ---------------------------------------------------------
        // Amber earns its place by being rare: active nav, the current session,
        // "this is yours". It deliberately avoids red (errors) and green
        // (success) so those keep their meaning.
        amber: {
          DEFAULT: "#FFB020",
          soft: "#FFC65C", // hover / lighter strokes
          deep: "#C77F00", // pressed
          ink: "#2A1B02", // text ON a solid amber fill
          // Low-alpha washes for tinted backgrounds and rings.
          "05": "rgba(255,176,32,0.05)",
          10: "rgba(255,176,32,0.10)",
          20: "rgba(255,176,32,0.20)",
          40: "rgba(255,176,32,0.40)",
        },

        // --- Semantic (unchanged meaning, retuned for the new base) ----------
        positive: "#3DD68C",
        negative: "#FF5A52",
      },
      fontSize: {
        // Oversized numerals for hero stats — the world-clock/crypto references
        // both lead with a very large figure and a small unit beside it.
        hero: ["clamp(3rem, 12vw, 5.5rem)", { lineHeight: "0.9", letterSpacing: "-0.04em" }],
        stat: ["clamp(1.75rem, 6vw, 2.5rem)", { lineHeight: "1", letterSpacing: "-0.03em" }],
      },
      borderRadius: {
        card: "16px",
        pill: "999px",
      },
      keyframes: {
        // Two identical halves translated by exactly -50% of the track, so the
        // loop point is invisible.
        marquee: {
          "0%": { transform: "translate3d(0,0,0)" },
          "100%": { transform: "translate3d(-50%,0,0)" },
        },
      },
      animation: {
        marquee: "marquee 34s linear infinite",
      },
      boxShadow: {
        // The floating pill nav needs real elevation to read as floating.
        float: "0 8px 32px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.4)",
        "amber-glow": "0 0 24px rgba(255,176,32,0.35)",
      },
    },
  },
  plugins: [],
}
