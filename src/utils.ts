export async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit,
  retries: number,
  retryableStatus: number[] = [429, 500, 502, 503, 504]
): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i += 1) {
    try {
      const response = await fetch(input, init);
      if (!retryableStatus.includes(response.status)) return response;
      lastErr = new Error(`Retryable status: ${response.status}`);
    } catch (error) {
      lastErr = error;
    }
    if (i < retries) {
      const waitMs = 200 * 2 ** i;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('fetch failed');
}

export function toIsoNow(): string {
  return new Date().toISOString();
}
