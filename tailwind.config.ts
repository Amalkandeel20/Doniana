import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1.25rem", screens: { "2xl": "1200px" } },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        ink: "#2a2420",
        ivory: "#fbf7f2",
        cream: "#f3ebe2",
        champagne: { DEFAULT: "#c2a77a", light: "#e6dac3", deep: "#7a6340" },
        sage: { DEFAULT: "#44594b", dark: "#34463a", light: "#dfe6de" },
        rose: { DEFAULT: "#e6cdc9", light: "#f3e3e0", deep: "#8f5650" },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 8px)",
        "2xl": "1.25rem",
        "3xl": "1.75rem",
      },
      fontFamily: {
        sans: ['"IBM Plex Sans Arabic"', "system-ui", "sans-serif"],
        display: ['"Cormorant Garamond"', '"IBM Plex Sans Arabic"', "serif"],
        // Calligraphic Arabic headings (Ruqaa), as in the client's reference artwork.
        heading: ['"Aref Ruqaa"', '"IBM Plex Sans Arabic"', "serif"],
      },
      letterSpacing: { brand: "0.32em" },
      keyframes: {
        "fade-up": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: { "fade-up": "fade-up 0.45s ease-out both" },
    },
  },
  plugins: [animate],
} satisfies Config;
