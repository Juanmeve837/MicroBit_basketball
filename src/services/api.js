import axios from "axios";

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000/api",
  timeout: 30000,
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error.response?.data?.detail ||
      error.response?.data?.message ||
      error.message ||
      "Error de conexión con el servidor";
    return Promise.reject(new Error(message));
  }
);

export async function uploadCsv(file, onProgress) {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await client.post("/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (evt) => {
      if (onProgress && evt.total) {
        onProgress(Math.round((evt.loaded * 100) / evt.total));
      }
    },
  });
  return data;
}

export async function getSessions({ dateFrom, dateTo, sortBy, order } = {}) {
  const { data } = await client.get("/sessions", {
    params: { date_from: dateFrom, date_to: dateTo, sort_by: sortBy, order },
  });
  return data;
}

export async function getSession(sessionId) {
  const { data } = await client.get(`/sessions/${sessionId}`);
  return data;
}

export async function deleteSession(sessionId) {
  const { data } = await client.delete(`/sessions/${sessionId}`);
  return data;
}

export async function getCompareData() {
  const { data } = await client.get("/compare");
  return data;
}

export default client;
