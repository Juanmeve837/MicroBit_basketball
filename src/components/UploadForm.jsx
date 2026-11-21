import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { uploadCsv } from "../services/api.js";
import { invalidate } from "../services/sessionCache.js";

export default function UploadForm() {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | uploading | success | error
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  // El log de nRF Connect solo trae la hora: la fecha de la sesion la elige el usuario (hoy, local).
  const [fecha, setFecha] = useState(() => new Date().toLocaleDateString("en-CA"));
  const inputRef = useRef(null);
  const navigate = useNavigate();

  const validateFile = (candidate) => {
    if (!candidate) return "No se seleccionó ningún archivo.";
    if (!candidate.name.toLowerCase().endsWith(".csv")) {
      return "El archivo debe tener extensión .csv";
    }
    if (candidate.size === 0) {
      return "El archivo está vacío.";
    }
    if (candidate.size > 20 * 1024 * 1024) {
      return "El archivo supera el tamaño máximo permitido (20MB).";
    }
    return null;
  };

  const handleFile = (candidate) => {
    const err = validateFile(candidate);
    if (err) {
      setErrorMsg(err);
      setStatus("error");
      setFile(null);
      return;
    }
    setErrorMsg("");
    setStatus("idle");
    setFile(candidate);
  };

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragActive(false);
    const dropped = e.dataTransfer.files?.[0];
    handleFile(dropped);
  }, []);

  const onSubmit = async () => {
    if (!file) return;
    setStatus("uploading");
    setProgress(0);
    setErrorMsg("");
    try {
      const sessionId = `${fecha.replaceAll("-", "")}_${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const result = await uploadCsv(file, setProgress, sessionId);
      invalidate();
      setStatus("success");
      if (result?.session_id) {
        navigate(`/sessions/${result.session_id}`);
      }
    } catch (err) {
      setStatus("error");
      setErrorMsg(err.message);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
      <h2 className="text-lg font-semibold mb-4">Subir sesión (CSV)</h2>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer border-2 border-dashed rounded-lg p-10 text-center transition-colors ${
          dragActive
            ? "border-court-orange bg-orange-50"
            : "border-slate-300 hover:border-slate-400"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <p className="text-slate-500">
          Arrastra un archivo <strong>.csv</strong> aquí, o haz clic para
          seleccionarlo.
        </p>
        {file && (
          <p className="mt-3 text-sm font-medium text-slate-700">
            {file.name} ({(file.size / 1024).toFixed(1)} KB)
          </p>
        )}
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm text-slate-600">
        Fecha de la sesión
        <input
          type="date"
          value={fecha}
          max={new Date().toLocaleDateString("en-CA")}
          onChange={(e) => setFecha(e.target.value)}
          required
          className="border border-slate-300 rounded-md px-2 py-1"
        />
      </label>

      {status === "error" && errorMsg && (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {errorMsg}
        </p>
      )}

      {status === "uploading" && (
        <div className="mt-4">
          <div className="w-full bg-slate-200 rounded-full h-2">
            <div
              className="bg-court-orange h-2 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 mt-1">Procesando… {progress}%</p>
        </div>
      )}

      {status === "success" && (
        <p className="mt-3 text-sm text-green-600">
          Sesión procesada correctamente. Redirigiendo…
        </p>
      )}

      <button
        onClick={onSubmit}
        disabled={!file || !fecha || status === "uploading"}
        className="mt-4 w-full sm:w-auto px-5 py-2 rounded-md bg-court-orange text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-orange-700 transition-colors"
      >
        {status === "uploading" ? "Subiendo…" : "Subir sesión"}
      </button>
    </div>
  );
}
