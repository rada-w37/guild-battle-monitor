export interface AuthenticatedUser {
  readonly uid: string;
  readonly displayName: string;
  readonly email: string;
  readonly photoUrl: string;
}

export type AuthState =
  | { readonly status: "loading" }
  | { readonly status: "disabled" }
  | { readonly status: "unavailable" }
  | { readonly status: "signed-out" }
  | { readonly status: "signed-in"; readonly user: AuthenticatedUser }
  | { readonly status: "error"; readonly error: Error };
