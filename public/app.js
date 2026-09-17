const equiposSeleccionados = { A: null, B: null };

async function buscarEquipo(lado) {
  const input = document.getElementById(`search-${lado}`);
  const listaEl = document.getElementById(`results-${lado}`);
  const nombre = input.value.trim();

  if (!nombre) return;

  listaEl.innerHTML = '<li>Buscando...</li>';

  try {
    const r = await fetch(`/api/team/search?name=${encodeURIComponent(nombre)}`);
    const equipos = await r.json();

    if (!equipos.length) {
      listaEl.innerHTML = '<li class="error-msg">No se encontraron equipos</li>';
      return;
    }

    listaEl.innerHTML = '';
    equipos.slice(0, 8).forEach((eq) => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${eq.nombre}</span><span class="liga">${eq.deporte}</span>`;
      li.onclick = () => seleccionarEquipo(lado, eq);
      listaEl.appendChild(li);
    });
  } catch (err) {
    listaEl.innerHTML = '<li class="error-msg">Error al conectar con la API</li>';
    console.error(err);
  }
}

function seleccionarEquipo(lado, equipo) {
  equiposSeleccionados[lado] = equipo;
  document.getElementById(`selected-${lado}`).textContent = `✔ ${equipo.nombre} (${equipo.deporte})`;
  document.getElementById(`results-${lado}`).innerHTML = '';
  actualizarBotonPredecir();
}

function actualizarBotonPredecir() {
  const btn = document.getElementById('btn-predecir');
  btn.disabled = !(equiposSeleccionados.A && equiposSeleccionados.B);
}

async function predecir() {
  const { A, B } = equiposSeleccionados;
  const homeTeam = document.getElementById('homeTeam').value;
  const resultadoEl = document.getElementById('resultado');

  resultadoEl.classList.remove('hidden');
  resultadoEl.innerHTML = '<p>Calculando predicción con datos reales...</p>';

  try {
    const params = new URLSearchParams({ teamAId: A.id, teamBId: B.id, homeTeam });
    const r = await fetch(`/api/predict?${params.toString()}`);
    const data = await r.json();

    if (data.error) {
      resultadoEl.innerHTML = `<p class="error-msg">${data.error}</p>`;
      return;
    }

    renderResultado(data);
  } catch (err) {
    resultadoEl.innerHTML = '<p class="error-msg">No se pudo generar la predicción. Intenta de nuevo.</p>';
    console.error(err);
  }
}

function renderResultado({ teamA, teamB, prediction }) {
  const resultadoEl = document.getElementById('resultado');

  const veredictoTexto =
    prediction.ganadorSugerido === 'A'
      ? `${teamA.nombre} parte como favorito`
      : prediction.ganadorSugerido === 'B'
      ? `${teamB.nombre} parte como favorito`
      : 'Partido muy parejo, sin favorito claro';

  resultadoEl.innerHTML = `
    <h3>Predicción del enfrentamiento</h3>

    <div class="prob-row">
      <span class="nombre">${teamA.nombre}</span>
      <div class="prob-bar-track">
        <div class="prob-bar-fill a" style="width: ${prediction.probabilidadA}%">${prediction.probabilidadA}%</div>
      </div>
    </div>
    <div class="stats-mini">Últimos ${teamA.partidosAnalizados} partidos — G:${teamA.wins} E:${teamA.draws} P:${teamA.losses} · forma reciente: ${teamA.formaReciente}</div>

    <div class="prob-row">
      <span class="nombre">${teamB.nombre}</span>
      <div class="prob-bar-track">
        <div class="prob-bar-fill b" style="width: ${prediction.probabilidadB}%">${prediction.probabilidadB}%</div>
      </div>
    </div>
    <div class="stats-mini">Últimos ${teamB.partidosAnalizados} partidos — G:${teamB.wins} E:${teamB.draws} P:${teamB.losses} · forma reciente: ${teamB.formaReciente}</div>

    <div class="veredicto">🏅 ${veredictoTexto}</div>
  `;
}
