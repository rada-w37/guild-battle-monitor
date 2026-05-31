import { DEFAULT_LOCAL_GVG_API_BASE_URL } from "../gvg/localGvgApiClient";
import type { GrandBattleBlockId, GrandBattleClassId } from "./types";

export type GrandBattleFetcher = (
  input: string,
  init?: RequestInit
) => Promise<Pick<Response, "ok" | "status" | "statusText" | "json">>;

export interface FetchGrandBattleOptions {
  readonly baseUrl?: string;
  readonly fetcher?: GrandBattleFetcher;
  readonly requestInit?: RequestInit;
}

export interface GrandBattleApiResponse<TData> extends Record<string, unknown> {
  readonly status?: number;
  readonly timestamp?: number;
  readonly data?: TData | null;
}

export interface GrandBattleWorldGroupResponse extends Record<string, unknown> {
  readonly group_id?: unknown;
  readonly worlds?: readonly unknown[] | null;
  readonly globalgvg?: unknown;
}

export interface GrandBattleLatestDataResponse extends Record<string, unknown> {
  readonly matching_number?: unknown;
  readonly castles?: readonly GrandBattleCastleResponse[] | null;
  readonly guilds?: Record<string, string> | null;
}

export interface GrandBattleCastleResponse extends Record<string, unknown> {
  readonly CastleId?: GrandBattleApiScalar;
  readonly GuildId?: GrandBattleApiScalar;
  readonly AttackerGuildId?: GrandBattleApiScalar;
  readonly AttackPartyCount?: GrandBattleApiScalar;
  readonly DefensePartyCount?: GrandBattleApiScalar;
  readonly GvgCastleState?: GrandBattleApiScalar;
  readonly UtcFallenTimeStamp?: GrandBattleApiScalar;
  readonly LastWinPartyKnockOutCount?: GrandBattleApiScalar;
}

export type GrandBattleApiScalar = string | number | boolean | null;

export class GrandBattleApiError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "GrandBattleApiError";
  }
}

export function buildGrandBattleWorldGroupsUrl(baseUrl = DEFAULT_LOCAL_GVG_API_BASE_URL): string {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;

  return new URL("wgroups", normalizedBaseUrl).toString();
}

export function buildGrandBattleLatestUrl(
  source: {
    readonly worldGroupId: number;
    readonly classId: GrandBattleClassId;
    readonly blockId: GrandBattleBlockId;
  },
  baseUrl = DEFAULT_LOCAL_GVG_API_BASE_URL
): string {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;

  return new URL(
    `wg/${source.worldGroupId}/globalgvg/${source.classId}/${source.blockId}/latest`,
    normalizedBaseUrl
  ).toString();
}

export async function fetchGrandBattleWorldGroups(
  options: FetchGrandBattleOptions = {}
): Promise<GrandBattleApiResponse<readonly GrandBattleWorldGroupResponse[]>> {
  return fetchGrandBattleApiJson<readonly GrandBattleWorldGroupResponse[]>(
    buildGrandBattleWorldGroupsUrl(options.baseUrl),
    "wgroups",
    options
  );
}

export async function fetchGrandBattleLatest(
  source: {
    readonly worldGroupId: number;
    readonly classId: GrandBattleClassId;
    readonly blockId: GrandBattleBlockId;
  },
  options: FetchGrandBattleOptions = {}
): Promise<GrandBattleApiResponse<GrandBattleLatestDataResponse>> {
  return fetchGrandBattleApiJson<GrandBattleLatestDataResponse>(
    buildGrandBattleLatestUrl(source, options.baseUrl),
    "globalgvg/latest",
    options
  );
}

async function fetchGrandBattleApiJson<TData>(
  url: string,
  endpointName: string,
  options: FetchGrandBattleOptions
): Promise<GrandBattleApiResponse<TData>> {
  const fetcher = options.fetcher ?? globalThis.fetch;

  if (!fetcher) {
    throw new GrandBattleApiError("fetch is not available");
  }

  const response = await fetcher(url, { method: "GET", ...options.requestInit });

  if (!response.ok) {
    throw new GrandBattleApiError(
      `${endpointName} request failed: ${response.status} ${response.statusText}`.trim(),
      response.status
    );
  }

  const payload = await parseGrandBattleJson<TData>(response, endpointName);

  if (!isGrandBattleApiResponseLike(payload)) {
    throw new GrandBattleApiError(`${endpointName} response is not an object`);
  }

  if (typeof payload.status === "number" && (payload.status < 200 || payload.status >= 300)) {
    throw new GrandBattleApiError(`${endpointName} envelope failed: ${payload.status}`, payload.status);
  }

  return payload;
}

async function parseGrandBattleJson<TData>(
  response: Pick<Response, "json">,
  endpointName: string
): Promise<GrandBattleApiResponse<TData>> {
  try {
    return (await response.json()) as GrandBattleApiResponse<TData>;
  } catch (error) {
    throw new GrandBattleApiError(
      error instanceof Error
        ? `${endpointName} JSON parse failed: ${error.message}`
        : `${endpointName} JSON parse failed`
    );
  }
}

function isGrandBattleApiResponseLike(value: unknown): value is GrandBattleApiResponse<unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
