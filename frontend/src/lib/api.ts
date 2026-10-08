/** 後端 API 用戶端：處理 {success, data, error} 信封與 CSRF。 */

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: Record<string, string[] | string> | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** 把欄位錯誤攤平成一句話，給表單顯示。 */
  get summary(): string {
    if (!this.details) return this.message;
    const parts = Object.values(this.details).flatMap((v) => (Array.isArray(v) ? v : [v]));
    return parts.length ? parts.join(' ') : this.message;
  }
}

function csrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function ensureCsrf(): Promise<string> {
  let token = csrfToken();
  if (!token) {
    await fetch('/api/auth/csrf/', { credentials: 'same-origin' });
    token = csrfToken();
  }
  if (!token) throw new ApiError(0, 'csrf', '無法取得安全驗證碼，請重新整理頁面');
  return token;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (method !== 'GET') {
    headers['X-CSRFToken'] = await ensureCsrf();
    headers['Content-Type'] = 'application/json';
  }

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network', '無法連線到伺服器');
  }

  if (response.status === 204) return undefined as T;
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    const error = json?.error;
    throw new ApiError(response.status, error?.code ?? 'error', error?.message ?? '發生未預期的錯誤', error?.details);
  }
  return json.data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
