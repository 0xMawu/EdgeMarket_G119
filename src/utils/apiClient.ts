// makes authenticated HTTP requests, adding the JWT auth header automatically
// if the server returns 401, calls onUnauthorized() then retries once

function buildHeaders(
  existingHeaders: HeadersInit | undefined,
  jwt: string | null,
): HeadersInit {
  let merged: Record<string, string> = {};

  if (existingHeaders) {
    if (existingHeaders instanceof Headers) {
      existingHeaders.forEach((value, key) => { merged[key] = value; });
    } else if (Array.isArray(existingHeaders)) {
      for (const [key, value] of existingHeaders) { merged[key] = value; }
    } else {
      merged = { ...(existingHeaders as Record<string, string>) };
    }
  }

  if (jwt !== null) {
    merged['Authorization'] = `Bearer ${jwt}`;
  }

  return merged;
}

export async function apiRequest(
  url: string,
  options: RequestInit,
  getJwt: () => string | null,
  onUnauthorized: () => Promise<void>,
): Promise<Response> {
  const firstJwt = getJwt();
  const firstOptions: RequestInit = {
    ...options,
    headers: buildHeaders(options.headers, firstJwt),
  };

  const firstResponse = await fetch(url, firstOptions);

  if (firstResponse.status !== 401) {
    return firstResponse;
  }

  // got 401 - call the handler then retry once with fresh JWT
  await onUnauthorized();

  const retryJwt = getJwt();
  const retryOptions: RequestInit = {
    ...options,
    headers: buildHeaders(options.headers, retryJwt),
  };

  return fetch(url, retryOptions);
}
