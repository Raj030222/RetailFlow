import React from "react";
import ReactDOM, { type Root } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import App from "./App";
import { BackendHealthProvider } from "./hooks/BackendHealthProvider";
import { ThemeProvider } from "./components/theme/ThemeProvider";
import { useTheme } from "./components/theme/themeContext";
import "./styles/index.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing React root element");

const root = (import.meta.hot?.data.root as Root | undefined) ?? ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ThemeProvider>
      <BackendHealthProvider>
        <BrowserRouter
          future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
        >
          <App />
          <ToasterContainer />
        </BrowserRouter>
      </BackendHealthProvider>
    </ThemeProvider>
  </React.StrictMode>,
);

if (import.meta.hot) {
  import.meta.hot.dispose((data) => {
    data.root = root;
  });
}

function ToasterContainer() {
  const { theme } = useTheme();
  return <Toaster closeButton position="bottom-right" richColors theme={theme} />;
}
