type Page<T> = { items?: T[]; nextPageToken?: string };

export async function allPages<T>(
  fetchPage: (pageToken: string | undefined) => Promise<Page<T>>,
): Promise<T[]> {
  const items: T[] = [];
  const seen = new Set<string>();
  let pageToken: string | undefined;
  do {
    const page = await fetchPage(pageToken);
    items.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
    if (pageToken && seen.has(pageToken)) throw new Error('Pagination Google : jeton déjà rencontré');
    if (pageToken) seen.add(pageToken);
  } while (pageToken);
  return items;
}
