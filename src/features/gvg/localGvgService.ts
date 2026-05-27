import type { AsyncLoadState } from "../../shared/asyncLoadState";
import { fetchLocalGvgLatest, type FetchLocalGvgLatestOptions } from "./localGvgApiClient";
import { normalizeLocalGvgSnapshot } from "./normalizeLocalGvg";
import type { GvgSnapshot, GvgWorldId } from "./types";

export type LoadLocalGvgSnapshotResult = AsyncLoadState<GvgSnapshot>;

export async function loadLocalGvgSnapshot(
  worldId: GvgWorldId | string,
  options: FetchLocalGvgLatestOptions = {}
): Promise<GvgSnapshot> {
  const response = await fetchLocalGvgLatest(worldId, options);

  return normalizeLocalGvgSnapshot(response);
}
