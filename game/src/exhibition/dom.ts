const elements = new Map<string, HTMLElement>();

/** The app's static tree is mounted once; do not repeat ID queries on every timer tick. */
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  let element = elements.get(id);
  if (!element) {
    element = document.getElementById(id) ?? undefined;
    if (!element) throw new Error(`Missing ${id}`);
    elements.set(id, element);
  }
  return element as T;
}

export function text(id: string, value: string): void {
  const element = byId(id);
  // Especially important for role=status: equal values must not be announced again.
  if (element.textContent !== value) element.textContent = value;
}
