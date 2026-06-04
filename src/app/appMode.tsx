import { createContext, useContext, type ReactNode } from "react";

export type AppMode = "owner" | "admin" | "guest";

const AppModeContext = createContext<AppMode | null>(null);

export function resolveAppMode(pathname: string): AppMode | null {
  return pathname === "/app" || pathname === "/app/" ? "owner" : null;
}

export function AppModeProvider({
  children,
  pathname = window.location.pathname
}: {
  readonly children: ReactNode;
  readonly pathname?: string;
}) {
  return <AppModeContext.Provider value={resolveAppMode(pathname)}>{children}</AppModeContext.Provider>;
}

export function useAppMode(): AppMode | null {
  return useContext(AppModeContext);
}
