import { createContext, useContext, useEffect, useState } from "react";
import { createMatch, setMatchWinner, getMatches } from "../services/MatchService";
import { useLiveReload } from "./useLiveReload";

const MatchContext = createContext();

export function MatchProvider({ children }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  // Sin volver a poner "Cargando…": la lista se recarga sola en segundo plano (6.18)
  async function loadMatches() {
    const data = await getMatches();
    setMatches(data);
    setLoading(false);
  }

  async function startMatch(player1_id, player2_id, table = null, discipline = "pool", options = {}) {
    const match = await createMatch(player1_id, player2_id, table, discipline, options);
    await loadMatches();
    return match;
  }

  async function finishMatch(matchId, winnerId) {
    await setMatchWinner(matchId, winnerId);
    await loadMatches();
  }

  useEffect(() => {
    loadMatches();
  }, []);

  // Un punto o un cambio de estado se aplica sobre la partida que ya está; altas y bajas recargan
  useLiveReload(["matches"], loadMatches, {
    patch: (row) => setMatches((ms) => ms.map((m) => (m.id === row.id ? { ...m, ...row } : m))),
  });

  return (
    <MatchContext.Provider
      value={{
        matches,
        loading,
        startMatch,
        finishMatch,
        reloadMatches: loadMatches,
      }}
    >
      {children}
    </MatchContext.Provider>
  );
}

export function useMatches() {
  return useContext(MatchContext);
}
