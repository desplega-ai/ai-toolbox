import { extendTheme } from "@mui/joy/styles";

export const theme = extendTheme({
  colorSchemes: {
    dark: {
      palette: {
        background: {
          body: "#0a0a0a",
          surface: "#111111",
          level1: "#1a1a1a",
          level2: "#222222",
          level3: "#2a2a2a",
        },
        text: {
          primary: "#ffffff",
          secondary: "#888888",
          tertiary: "#666666",
        },
        primary: {
          50: "#e6fff5",
          100: "#b3ffe0",
          200: "#80ffcc",
          300: "#4dffb8",
          400: "#1affa3",
          500: "#00ff88", // Main terminal green
          600: "#00cc6d",
          700: "#009952",
          800: "#006637",
          900: "#00331c",
        },
        success: {
          500: "#00ff88",
        },
        warning: {
          500: "#ffaa00",
        },
        danger: {
          500: "#ff4444",
        },
        neutral: {
          50: "#f5f5f5",
          100: "#e0e0e0",
          200: "#c0c0c0",
          300: "#a0a0a0",
          400: "#808080",
          500: "#666666",
          600: "#4d4d4d",
          700: "#333333",
          800: "#1a1a1a",
          900: "#0a0a0a",
        },
      },
    },
  },
  fontFamily: {
    body: "'Inter', sans-serif",
    display: "'Inter', sans-serif",
    code: "'JetBrains Mono', monospace",
  },
  components: {
    JoyCard: {
      styleOverrides: {
        root: {
          backgroundColor: "#111111",
          borderColor: "#1a1a1a",
          borderWidth: "1px",
          borderStyle: "solid",
        },
      },
    },
    JoyInput: {
      styleOverrides: {
        root: {
          fontFamily: "'JetBrains Mono', monospace",
        },
      },
    },
    JoyButton: {
      styleOverrides: {
        root: {
          fontWeight: 600,
        },
      },
    },
  },
});
