// Purpose: Type the validated Jev provider and its offline test double.
export type JevRequest = {
  state: unknown;
  questions: Record<string, unknown>;
  signal?: AbortSignal;
};

export type JevProvider = {
  decide(request: JevRequest): Promise<any>;
};

export function createJevClient(options?: {
  apiKey?: string;
  endpoint?: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): JevProvider;

export function createFakeProvider(
  responder: (request: JevRequest, calls: number) => any,
): JevProvider & { readonly calls: number };
