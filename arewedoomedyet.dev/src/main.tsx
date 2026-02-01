import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import "./index.css";
import App from "./App";

// In dev, Bun doesn't run build.ts, so CONVEX_URL won't be defined.
// We read from .env.local which Bun auto-loads in the server process.
// For production builds, build.ts injects CONVEX_URL via define.
declare const CONVEX_URL: string | undefined;
const convexUrl = typeof CONVEX_URL !== "undefined" ? CONVEX_URL : "https://unique-shark-560.convex.cloud";
const convex = new ConvexReactClient(convexUrl);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <App />
    </ConvexProvider>
  </StrictMode>
);
