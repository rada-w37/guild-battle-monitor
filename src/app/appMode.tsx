import { createContext, useContext, useMemo, type ReactNode } from "react";

export type AppMode = "owner" | "admin" | "guest";

export interface AppModePermissions {
  readonly canEditBattleState: boolean;
  readonly canEditViewSettings: boolean;
  readonly canPersistViewSettings: boolean;
  readonly canEditAlertSettings: boolean;
  readonly canManageNotifications: boolean;
  readonly canManageGuildProfile: boolean;
  readonly canManageShareUrls: boolean;
  readonly showAlertSettings: boolean;
  readonly showNotificationSettings: boolean;
  readonly showOwnedGuildSettings: boolean;
  readonly showShareSettings: boolean;
}

export type AppRoute =
  | { readonly mode: "owner" }
  | { readonly mode: "admin" | "guest"; readonly guildId: string; readonly accessKey: string };

const AppRouteContext = createContext<AppRoute | null>(null);
const GITHUB_PAGES_BASE_PATH = "/guild-battle-monitor";
const SIGNED_OUT_OWNER_PERMISSIONS_OVERRIDE: Partial<AppModePermissions> = {
  canEditBattleState: false,
  canPersistViewSettings: false,
  canManageNotifications: false,
  canManageGuildProfile: false,
  canManageShareUrls: false,
  showNotificationSettings: false,
  showOwnedGuildSettings: false,
  showShareSettings: false
};

export function resolveAppMode(pathname: string): AppMode | null {
  return resolveRoute(pathname)?.mode ?? null;
}

export function getAppModePermissions(mode: AppMode): AppModePermissions {
  const canEditBattleState = mode !== "guest";
  const canManageNotifications = mode !== "guest";
  const canManageGuildProfile = mode === "owner";
  const canManageShareUrls = mode === "owner";

  return {
    canEditBattleState,
    canEditViewSettings: true,
    canPersistViewSettings: mode === "owner",
    canEditAlertSettings: true,
    canManageNotifications,
    canManageGuildProfile,
    canManageShareUrls,
    showAlertSettings: true,
    showNotificationSettings: canManageNotifications,
    showOwnedGuildSettings: canManageGuildProfile,
    showShareSettings: canManageShareUrls
  };
}

export function getFirebasePermissionsOverride({
  isSignedInOwner,
  mode
}: {
  readonly isSignedInOwner: boolean;
  readonly mode: AppMode;
}): Partial<AppModePermissions> | undefined {
  return mode === "owner" && !isSignedInOwner ? SIGNED_OUT_OWNER_PERMISSIONS_OVERRIDE : undefined;
}

export function resolveRoute(pathname: string): AppRoute | null {
  const routePathname = stripGithubPagesBasePath(pathname);

  if (routePathname === "/") {
    return { mode: "owner" };
  }

  const sharedRouteMatch = routePathname.match(/^\/([^/]+)\/([^/]+)$/);

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

export function stripGithubPagesBasePath(pathname: string): string {
  if (pathname === GITHUB_PAGES_BASE_PATH || pathname === `${GITHUB_PAGES_BASE_PATH}/`) {
    return "/";
  }

  if (pathname.startsWith(`${GITHUB_PAGES_BASE_PATH}/`)) {
    return pathname.slice(GITHUB_PAGES_BASE_PATH.length);
  }

  return pathname;
}

export function AppModeProvider({
  children,
  pathname = window.location.pathname
}: {
  readonly children: ReactNode;
  readonly pathname?: string;
}) {
  const route = useMemo(() => resolveRoute(pathname), [pathname]);

  return <AppRouteContext.Provider value={route}>{children}</AppRouteContext.Provider>;
}

export function useAppMode(): AppMode | null {
  return useAppRoute()?.mode ?? null;
}

export function useAppRoute(): AppRoute | null {
  return useContext(AppRouteContext);
}
