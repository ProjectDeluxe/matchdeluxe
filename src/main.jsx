import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import "./index.css";
import Layout from "./Layout.jsx";
import Login from "./auth/Login.jsx";

import Feed from "./clips/Feed.jsx";
import Partidas from "./partidas/Partidas.jsx";
import NuevaPartida from "./partidas/NuevaPartida.jsx";
import Partida from "./partidas/Partida.jsx";
import PartidaControl from "./partidas/PartidaControl.jsx";
import EscanearQR from "./partidas/EscanearQR.jsx";
import Buscar from "./buscar/Buscar.jsx";
import NuevoJugador from "./jugadores/NuevoJugador.jsx";
import PerfilJugador from "./jugadores/PerfilJugador.jsx";
import Perfil from "./perfil/Perfil.jsx";
import Clubs from "./clubs/Clubs.jsx";
import ClubPublico from "./clubs/ClubPublico.jsx";
import Plan from "./plan/Plan.jsx";
import MesaAbierta from "./mesa/MesaAbierta.jsx";
import ClipPublico from "./clips/ClipPublico.jsx";

import { PlayerProvider } from "./context/PlayerContext";
import { MatchProvider } from "./context/MatchContext";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <AuthProvider>
      <PlayerProvider>
        <MatchProvider>
          <Layout>
            <Routes>
              {/* Pública */}
              <Route path="/login" element={<Login />} />
              <Route path="/mesa/:token" element={<MesaAbierta />} />
              <Route path="/c/:id" element={<ClipPublico />} />

              {/* Protegidas. Inicio = feed de clips (rediseño 2026-10) */}
              <Route path="/" element={<ProtectedRoute><Feed /></ProtectedRoute>} />
              <Route path="/partida" element={<ProtectedRoute><Partidas /></ProtectedRoute>} />
              <Route path="/partida/escanear" element={<EscanearQR />} />
              <Route path="/partida/nueva" element={<ProtectedRoute><NuevaPartida /></ProtectedRoute>} />
              <Route path="/partida/:id" element={<ProtectedRoute><Partida /></ProtectedRoute>} />
              <Route path="/partida/:id/control" element={<ProtectedRoute><PartidaControl /></ProtectedRoute>} />
              <Route path="/buscar" element={<ProtectedRoute><Buscar /></ProtectedRoute>} />
              <Route path="/jugadores/nuevo" element={<ProtectedRoute><NuevoJugador /></ProtectedRoute>} />
              <Route path="/jugadores/:id" element={<ProtectedRoute><PerfilJugador /></ProtectedRoute>} />
              <Route path="/club/:id" element={<ProtectedRoute><ClubPublico /></ProtectedRoute>} />
              <Route path="/perfil" element={<ProtectedRoute><Perfil /></ProtectedRoute>} />
              <Route path="/clubs" element={<ProtectedRoute><Clubs /></ProtectedRoute>} />
              <Route path="/plan" element={<ProtectedRoute><Plan /></ProtectedRoute>} />

              {/* Direcciones viejas, por si alguien las tiene guardadas */}
              <Route path="/clips" element={<Navigate to="/" replace />} />
              <Route path="/feed" element={<Navigate to="/" replace />} />
              <Route path="/historial" element={<Navigate to="/partida" replace />} />
              <Route path="/jugadores" element={<Navigate to="/buscar" replace />} />

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        </MatchProvider>
      </PlayerProvider>
    </AuthProvider>
  </BrowserRouter>
);
