import { type APIRequestContext, type APIResponse, expect, test } from "@playwright/test";
import { API_URL } from "./env";

export interface User {
  id: number;
  name: string;
  email: string;
  role: "member" | "admin";
  created_at: string;
}

export interface Resource {
  id: number;
  name: string;
  description: string | null;
  category: "room" | "equipment" | "space" | "vehicle";
  location: string | null;
  capacity: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Reservation {
  id: number;
  status: "confirmed" | "cancelled";
  starts_at: string;
  ends_at: string;
  notes: string | null;
  cancelled_at: string | null;
  resource: { id: number; name: string };
  user: { id: number; name: string };
  created_at: string;
}

export interface PageMeta {
  page: number;
  per_page: number;
  total_count: number;
  total_pages: number;
  next_page: number | null;
  prev_page: number | null;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: Record<string, string[]> };
}

/**
 * Thin, typed wrapper around Playwright's APIRequestContext.
 * Methods return the raw APIResponse so tests can assert on status codes.
 */
export class ApiClient {
  constructor(
    private readonly request: APIRequestContext,
    readonly token?: string,
  ) {}

  withToken(token: string): ApiClient {
    return new ApiClient(this.request, token);
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = { Accept: "application/json", ...extra };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    return headers;
  }

  get(path: string, params?: Record<string, string | number | boolean>): Promise<APIResponse> {
    return this.request.get(`${API_URL}${path}`, { headers: this.headers(), params });
  }

  post(path: string, data?: unknown): Promise<APIResponse> {
    return this.request.post(`${API_URL}${path}`, { headers: this.headers(), data });
  }

  patch(path: string, data?: unknown): Promise<APIResponse> {
    return this.request.patch(`${API_URL}${path}`, { headers: this.headers(), data });
  }

  /** Sends a raw (possibly malformed) JSON body. */
  postRaw(path: string, body: string): Promise<APIResponse> {
    return this.request.post(`${API_URL}${path}`, {
      headers: this.headers({ "Content-Type": "application/json" }),
      data: body,
    });
  }

  delete(path: string): Promise<APIResponse> {
    return this.request.delete(`${API_URL}${path}`, { headers: this.headers() });
  }

  async login(email: string, password: string): Promise<{ token: string; user: User }> {
    const response = await this.post("/api/v1/auth/login", { email, password });
    expect(response.status(), await response.text()).toBe(200);
    return response.json();
  }

  async firstActiveResource(category = "equipment"): Promise<Resource> {
    const response = await this.get("/api/v1/resources", { category });
    expect(response.ok()).toBeTruthy();
    const { data } = (await response.json()) as { data: Resource[] };
    expect(data.length, `expected at least one active ${category}`).toBeGreaterThan(0);
    return data[0];
  }

  /**
   * Creates a reservation, behaving like a well-mannered client: if the API's
   * per-user rate limit (30 bookings/minute) answers 429, wait and retry instead
   * of failing the test. Each wait is recorded as an annotation in the report.
   */
  async createReservation(body: Record<string, unknown>, maxRetries = 2): Promise<APIResponse> {
    for (let attempt = 0; ; attempt++) {
      const response = await this.post("/api/v1/reservations", { reservation: body });
      if (response.status() !== 429 || attempt >= maxRetries) return response;

      const retryAfter = Number(response.headers()["retry-after"]) || 61;
      test.info().annotations.push({ type: "rate-limited", description: `429 on create; waited ${retryAfter}s before retrying` });
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    }
  }

  async cancelReservation(id: number): Promise<APIResponse> {
    return this.patch(`/api/v1/reservations/${id}/cancel`);
  }
}

/** Asserts the API's standard error envelope and returns it. */
export async function expectApiError(response: APIResponse, status: number, code: string): Promise<ApiErrorBody> {
  const text = await response.text();
  expect(response.status(), text).toBe(status);
  const body = JSON.parse(text) as ApiErrorBody;
  expect(body.error.code).toBe(code);
  expect(typeof body.error.message).toBe("string");
  return body;
}
