import { NavLink, Route, Routes } from "react-router-dom";
import Home from "./pages/Home.jsx";
import SessionDetail from "./pages/SessionDetail.jsx";
import Compare from "./pages/Compare.jsx";

const navLinkClass = ({ isActive }) =>
  `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
    isActive
      ? "bg-court-orange text-white"
      : "text-slate-600 hover:bg-slate-200"
  }`;

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <nav className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-bold text-lg text-court-dark">
            🏀 Basket Tracker
          </span>
          <div className="flex gap-2">
            <NavLink to="/" end className={navLinkClass}>
              Inicio
            </NavLink>
            <NavLink to="/compare" className={navLinkClass}>
              Comparativas
            </NavLink>
          </div>
        </nav>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/sessions/:sessionId" element={<SessionDetail />} />
          <Route path="/compare" element={<Compare />} />
        </Routes>
      </main>

      <footer className="text-center text-xs text-slate-400 py-4">
        Basket Tracker · datos capturados con micro:bit
      </footer>
    </div>
  );
}
