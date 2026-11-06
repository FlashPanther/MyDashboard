type Page<T> = { items?: T[]; nextPageToken?: string };

export async function allPages<T>(
  fetchPage: (pageToken: string | undefined) => Promise<Page<T>>,
): Promise<T[]> {
  const items: T[] = [];
  let pageToken: string | undefined;
  do {
    const page = await fetchPage(pageToken);
    items.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return items;
}
