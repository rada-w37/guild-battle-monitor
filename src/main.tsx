import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { AppModeProvider } from "./app/appMode";
import "./app/styles.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <AppModeProvider>
      <App />
    </AppModeProvider>
  </StrictMode>
);
