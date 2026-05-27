import type { LocalGvgApiResponse } from "./localGvgApiTypes";
import type { GvgWorldId } from "./types";

export const DEFAULT_LOCAL_GVG_API_BASE_URL = "https://api.mentemori.icu";

export type LocalGvgFetcher = (
  input: string,
  init?: RequestInit
) => Promise<Pick<Response, "ok" | "status" | "statusText" | "json">>;

export interface FetchLocalGvgLatestOptions {
  readonly baseUrl?: string;
  readonly fetcher?: LocalGvgFetcher;
  readonly requestInit?: RequestInit;
}

export class LocalGvgApiError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "LocalGvgApiError";
  }
}

export function buildLocalGvgLatestUrl(
  worldId: GvgWorldId | string,
  baseUrl = DEFAULT_LOCAL_GVG_API_BASE_URL
): string {
  const normalizedWorldId = String(worldId).trim();

  if (normalizedWorldId.length === 0) {
    throw new LocalGvgApiError("worldId is required");
  }

  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;

  return new URL(`${encodeURIComponent(normalizedWorldId)}/localgvg/latest`, normalizedBaseUrl)
    .toString();
}

export async function fetchLocalGvgLatest(
  worldId: GvgWorldId | string,
  options: FetchLocalGvgLatestOptions = {}
): Promise<LocalGvgApiResponse> {
  const fetcher = options.fetcher ?? globalThis.fetch;

  if (!fetcher) {
    throw new LocalGvgApiError("fetch is not available");
  }

  const url = buildLocalGvgLatestUrl(worldId, options.baseUrl);
  const response = await fetcher(url, { method: "GET", ...options.requestInit });

  if (!response.ok) {
    throw new LocalGvgApiError(
      `localgvg/latest request failed: ${response.status} ${response.statusText}`.trim(),
      response.status
    );
  }

  const payload = await parseLocalGvgJson(response);

  if (!isLocalGvgApiResponseLike(payload)) {
    throw new LocalGvgApiError("localgvg/latest response is not an object");
  }

  if (typeof payload.status === "number" && (payload.status < 200 || payload.status >= 300)) {
    throw new LocalGvgApiError(`localgvg/latest envelope failed: ${payload.status}`, payload.status);
  }

  return payload;
}

async function parseLocalGvgJson(
  response: Pick<Response, "json">
): Promise<LocalGvgApiResponse> {
  try {
    return (await response.json()) as LocalGvgApiResponse;
  } catch (error) {
    throw new LocalGvgApiError(
      error instanceof Error
        ? `localgvg/latest JSON parse failed: ${error.message}`
        : "localgvg/latest JSON parse failed"
    );
  }
}

function isLocalGvgApiResponseLike(value: unknown): value is LocalGvgApiResponse {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
