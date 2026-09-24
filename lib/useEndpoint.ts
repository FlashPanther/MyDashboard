'use client';

import useSWR from 'swr';

export type EndpointState<T> = {
  data: T | undefined;
  error: string | null;
  notConnected: boolean;
  /** Compte relie, mais sans l'autorisation pour cette API : relier a nouveau. */
  scopeMissing: boolean;
  /** L'API n'est pas activee dans le projet Google Cloud. */
  apiDisabled: boolean;
  /** Quand apiDisabled : le service refuse et la page pour l'activer. */
  disabledService: string | null;
  activationUrl: string | null;
  isLoading: boolean;
  refresh: () => void;
};

class HttpError extends Error {
  constructor(
    message: string,
    readonly notConnected: boolean,
    readonly scopeMissing = false,
    readonly apiDisabled = false,
    readonly service: string | null = null,
    readonly activationUrl: string | null = null,
  ) {
    super(message);
  }
}

async function fetcher(url: string) {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({ error: `Réponse illisible (${res.status})` }));
  if (!res.ok)
    throw new HttpError(
      body.error ?? `Erreur ${res.status}`,
      Boolean(body.notConnected),
      Boolean(body.scopeMissing),
      Boolean(body.apiDisabled),
      body.service ?? null,
      body.activationUrl ?? null,
    );
  return body;
}

export function useEndpoint<T>(url: string | null, refreshSeconds: number): EndpointState<T> {
  const { data, error, isLoading, mutate } = useSWR<T>(url, fetcher, {
    refreshInterval: refreshSeconds * 1000,
    revalidateOnFocus: true,
    keepPreviousData: true,
    shouldRetryOnError: false,
  });

  return {
    data,
    error: error ? (error as Error).message : null,
    notConnected: error instanceof HttpError && error.notConnected,
    scopeMissing: error instanceof HttpError && error.scopeMissing,
    apiDisabled: error instanceof HttpError && error.apiDisabled,
    disabledService: error instanceof HttpError ? error.service : null,
    activationUrl: error instanceof HttpError ? error.activationUrl : null,
    isLoading,
    refresh: () => void mutate(),
  };
}
