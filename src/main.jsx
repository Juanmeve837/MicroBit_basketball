import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";

// HashRouter (en vez de BrowserRouter) porque GitHub Pages no soporta
// rewrites del lado del servidor: una recarga directa en /sessions/:id
// bajo BrowserRouter devolveria 404. Con hash routing (#/sessions/:id)
// siempre resuelve al index.html real.
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
