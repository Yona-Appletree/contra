import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@caller/ui-design/theme.css";
import { App } from "./App.js";

const container = document.getElementById("root");
if (!container) {
  throw new Error("#root element not found");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
