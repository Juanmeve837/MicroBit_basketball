// api.js — Envío de la sesión capturada al backend (POST /api/sesion).
//
// El backend FastAPI todavía no existe en este repo (ver config/config.yaml
// -> api.host/api.port, README "Pendiente"). Esta función asume el contrato
// planeado; si el backend no responde, el caller debe ofrecer "Guardar lo
// que llegó" (descarga local) en vez de bloquear al usuario.

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export async function postSesion(csvString, sessionId) {
  const formData = new FormData();
  formData.append("session_id", sessionId);
  formData.append(
    "file",
    new Blob([csvString], { type: "text/csv" }),
    `sesion_${sessionId}.csv`
  );

  const response = await fetch(`${API_URL}/api/sesion`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const texto = await response.text().catch(() => "");
    throw new Error(`Backend respondió ${response.status}: ${texto || response.statusText}`);
  }

  return response.json();
}
