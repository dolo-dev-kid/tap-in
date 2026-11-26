import { HashRouter, Routes, Route } from "react-router-dom";

import Login from "../pages/Login";
import Register from "../pages/Register";
import Dashboard from "../pages/Dashboard";
import Connect from "../pages/Connect";

export default function AppRouter() {
  // Plain-path /connect (https://tap-in-cakt.onrender.com/connect?app=...):
  // the Render rewrite serves index.html for it, but there is no hash
  // for the HashRouter to read — so render the authorize page directly
  // instead of the dashboard. The hash form (#/connect?...) goes
  // through the route below.
  if (
    typeof window !== "undefined" &&
    window.location.pathname.replace(/\/+$/, "") === "/connect"
  ) {
    return <Connect />;
  }
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/connect" element={<Connect />} />
        {/* Unknown paths land on the app instead of a blank page. */}
        <Route path="*" element={<Dashboard />} />
      </Routes>
    </HashRouter>
  );
}
