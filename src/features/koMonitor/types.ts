export interface KoObserverRunMeta {
  readonly lastStartedAt: Date;
}

export interface KoGuildKoTotal {
  readonly guildId: string;
  readonly guildName: string;
  readonly totalVictimKoCount: number | null;
  readonly updatedAt: Date | null;
}

export type KoGuildKoTotalsSubscriber = (
  onRows: (rows: readonly KoGuildKoTotal[]) => void,
  onError: (error: Error) => void
) => () => void;

export type KoMonitorLoadState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | {
      readonly status: "success";
      readonly isObserverStarted: boolean;
      readonly rows: readonly KoGuildKoTotal[];
    }
  | {
      readonly status: "error";
      readonly error: Error;
      readonly rows: readonly KoGuildKoTotal[];
    };
