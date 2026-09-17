    import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SPORTSDB_BASE = 'https://www.thesportsdb.com/api/v1/json/3';

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Muchos clubes (sobre todo latinoamericanos) están registrados con un prefijo
// de su nombre oficial (ej. "CR Flamengo", "SE Palmeiras", "CA Boca Juniors").
// Si la búsqueda tal cual no encuentra nada, probamos con estos prefijos.
const PREFIJOS_COMUNES = ['CR', 'SE', 'CA', 'CD', 'CF', 'SC', 'EC', 'AA', 'AC', 'FC'];

async function buscarEnAPI(termino) {
  const r = await fetch(`${SPORTSDB_BASE}/searchteams.php?t=${encodeURIComponent(termino)}`);
  const data = await r.json();
  return data.teams || [];
}

app.get('/api/team/search', async (req, res) => {
  const { name } = req.query;
  if (!name) {
    return res.status(400).json({ error: 'Falta el parámetro "name"' });
  }
  try {
    let teams = await buscarEnAPI(name);

    if (!teams.length) {
      const intentos = PREFIJOS_COMUNES.map((prefijo) => buscarEnAPI(`${prefijo} ${name}`));
      const resultados = await Promise.all(intentos);
      const encontrados = resultados.flat();

      const vistos = new Set();
      teams = encontrados.filter((t) => {
        if (vistos.has(t.idTeam)) return false;
        vistos.add(t.idTeam);
        return true;
      });
    }

    const equipos = teams.map((t) => ({
      id: t.idTeam,
      nombre: t.strTeam,
      deporte: t.strSport,
      liga: t.strLeague,
      escudo: t.strTeamBadge,
    }));
    res.json(equipos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error consultando la API de deportes' });
  }
});

app.get('/api/predict', async (req, res) => {
  const { teamAId, teamBId, homeTeam } = req.query;
  if (!teamAId || !teamBId) {
    return res.status(400).json({ error: 'Faltan los IDs de los equipos (teamAId, teamBId)' });
  }
  try {
    const [formA, formB] = await Promise.all([
      getTeamForm(teamAId),
      getTeamForm(teamBId),
    ]);
    const prediction = calculatePrediction(formA, formB, homeTeam);
    res.json({ teamA: formA, teamB: formB, prediction });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error generando la predicción' });
  }
});

async function getTeamForm(teamId) {
  const r = await fetch(`${SPORTSDB_BASE}/eventslast.php?id=${teamId}`);
  const data = await r.json();
  const events = (data.results || []).slice(0, 5);

  const weights = [0.35, 0.25, 0.2, 0.12, 0.08];

  let wins = 0, draws = 0, losses = 0;
  let weightedScore = 0, totalWeight = 0;
  let nombreEquipo = 'Equipo';

  events.forEach((ev, i) => {
    const isHome = String(ev.idHomeTeam) === String(teamId);
    nombreEquipo = isHome ? ev.strHomeTeam : ev.strAwayTeam;

    const golesFavor = parseInt(isHome ? ev.intHomeScore : ev.intAwayScore, 10);
    const golesContra = parseInt(isHome ? ev.intAwayScore : ev.intHomeScore, 10);

    let resultado = 0.5;
    if (!isNaN(golesFavor) && !isNaN(golesContra)) {
      if (golesFavor > golesContra) { resultado = 1; wins++; }
      else if (golesFavor < golesContra) { resultado = 0; losses++; }
      else { resultado = 0.5; draws++; }
    }

    const w = weights[i] || 0.05;
    weightedScore += resultado * w;
    totalWeight += w;
  });

  const partidosAnalizados = events.length;
  const winRate = partidosAnalizados ? wins / partidosAnalizados : 0.5;
  const formaReciente = totalWeight ? weightedScore / totalWeight : 0.5;

  return {
    id: teamId,
    nombre: nombreEquipo,
    partidosAnalizados,
    wins,
    draws,
    losses,
    winRate: Number(winRate.toFixed(2)),
    formaReciente: Number(formaReciente.toFixed(2)),
  };
}

function calculatePrediction(formA, formB, homeTeam) {
  const HOME_BONUS = 0.15;

  let scoreA = formA.winRate * 0.5 + formA.formaReciente * 0.5;
  let scoreB = formB.winRate * 0.5 + formB.formaReciente * 0.5;

  if (homeTeam === 'A') scoreA += HOME_BONUS;
  if (homeTeam === 'B') scoreB += HOME_BONUS;

  const total = scoreA + scoreB || 1;
  const probA = scoreA / total;
  const probB = scoreB / total;

  let ganadorSugerido = 'Empate probable';
  if (probA - probB > 0.1) ganadorSugerido = 'A';
  else if (probB - probA > 0.1) ganadorSugerido = 'B';

  return {
    probabilidadA: Number((probA * 100).toFixed(1)),
    probabilidadB: Number((probB * 100).toFixed(1)),
    ganadorSugerido,
  };
}

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
