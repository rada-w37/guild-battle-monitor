import { createContext, useContext, type ReactNode } from "react";

export type AppMode = "owner" | "admin" | "guest";

export interface AppModePermissions {
  readonly canEditBattleState: boolean;
  readonly canEditViewSettings: boolean;
  readonly canEditAlertSettings: boolean;
  readonly showAlertSettings: boolean;
  readonly showNotificationSettings: boolean;
  readonly showOwnedGuildSettings: boolean;
  readonly showShareSettings: boolean;
}

export type AppRoute =
  | { readonly mode: "owner" }
  | { readonly mode: "admin" | "guest"; readonly guildId: string; readonly accessKey: string };

const AppRouteContext = createContext<AppRoute | null>(null);

export function resolveAppMode(pathname: string): AppMode | null {
  return resolveRoute(pathname)?.mode ?? null;
}

export function getAppModePermissions(mode: AppMode): AppModePermissions {
  const canEditBattleState = mode !== "guest";

  return {
    canEditBattleState,
    canEditViewSettings: true,
    canEditAlertSettings: true,
    showAlertSettings: true,
    showNotificationSettings: mode !== "guest",
    showOwnedGuildSettings: mode === "owner",
    showShareSettings: mode === "owner"
  };
}

export function resolveRoute(pathname: string): AppRoute | null {
  if (pathname === "/app" || pathname === "/app/") {
    return { mode: "owner" };
  }

  const sharedRouteMatch = pathname.match(/^\/([^/]+)\/([^/]+)$/);

  if (sharedRouteMatch === null) {
    return null;
  }

  const [, guildId, accessKey] = sharedRouteMatch;

  if (accessKey.startsWith("a_") && accessKey.length > 2) {
    return { mode: "admin", guildId, accessKey };
  }

  if (accessKey.startsWith("g_") && accessKey.length > 2) {
    return { mode: "guest", guildId, accessKey };
  }

  return null;
}

export function AppModeProvider({
  children,
  pathname = window.location.pathname
}: {
  readonly children: ReactNode;
  readonly pathname?: string;
}) {
  return <AppRouteContext.Provider value={resolveRoute(pathname)}>{children}</AppRouteContext.Provider>;
}

export function useAppMode(): AppMode | null {
  return useAppRoute()?.mode ?? null;
}

export function useAppRoute(): AppRoute | null {
  return useContext(AppRouteContext);
}
