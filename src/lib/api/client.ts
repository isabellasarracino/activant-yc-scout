/**
 * Thin, typed wrappers around our own REST API for client components to
 * call. Deliberately just `fetch` + typed return, not a data-fetching
 * library (SWR/React Query) — three simple GETs and one POST don't
 * justify a new dependency; revisit if the frontend grows real caching
 * needs.
 */
import type { BatchDTO, CompanyCompactDTO, CompanyFullDTO } from "./serialize";

export interface BatchDetailResponse {
  batch: BatchDTO;
  teamGeneral: CompanyCompactDTO[];
  thesisFit: CompanyCompactDTO[];
  unranked: CompanyCompactDTO[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(body?.error ?? `Request to ${url} failed with status ${res.status}`, res.status);
  }
  return body as T;
}

export async function fetchBatches(): Promise<BatchDTO[]> {
  const { batches } = await getJson<{ batches: BatchDTO[] }>("/api/batches");
  return batches;
}

export async function fetchBatchDetail(batchId: string): Promise<BatchDetailResponse> {
  return getJson<BatchDetailResponse>(`/api/batches/${encodeURIComponent(batchId)}`);
}

export async function fetchCompanyDetail(slug: string): Promise<CompanyFullDTO> {
  return getJson<CompanyFullDTO>(`/api/companies/${encodeURIComponent(slug)}`);
}

export async function postChatMessage(message: string, history: ChatMessage[]): Promise<string> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, history }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(body?.error ?? "Chat request failed.", res.status);
  }
  return body.answer as string;
}

export { ApiError };
