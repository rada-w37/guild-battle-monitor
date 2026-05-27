export type AsyncLoadState<TData> =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "success"; readonly data: TData }
  | { readonly status: "error"; readonly error: Error };
