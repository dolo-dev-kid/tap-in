import axiosInstance from "./axios";

// Base URL of the backend, so media URLs like "/uploads/<id>" render
// against the same server the app talks to.
export function apiBase() {
  return axiosInstance.defaults.baseURL || "";
}

// Turn a relative media URL ("/uploads/<id>") into a full URL the
// browser can load. Absolute URLs (e.g. an old avatar link) pass through.
export function mediaUrl(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url) || url.startsWith("data:")) return url;
  return `${apiBase()}${url.startsWith("/") ? url : `/${url}`}`;
}

// Upload one file to POST /uploads (logged-in members only).
// Returns the upload object: { id, url, filename, mimeType, size, kind }.
export async function uploadFile(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${apiBase()}/uploads`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${localStorage.getItem("token") || ""}`
    },
    body: form
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Upload failed — please try again.");
  }
  return data.upload;
}

export async function deleteUpload(id) {
  const res = await axiosInstance.delete(`/uploads/${id}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` }
  });
  return res.data;
}
