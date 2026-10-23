import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// Rebuild marker for the GitHub Pages production artifact.
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
