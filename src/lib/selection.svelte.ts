/**
 * Shared model selection for every figure on the page (one filter, many charts).
 * Colour follows the entity: a model keeps its slot colour until it is removed,
 * whatever happens to the other selected models.
 */
export const MAX_MODELS = 3;
/** validated 3-slot categorical palette for the dark surface (see docs/design.md) */
export const MODEL_COLORS = ['#3987e5', '#c98500', '#d55181'] as const;

export interface CustomModel {
  enabled: boolean;
  H0: number;
  Om: number;
  w0: number;
  wa: number;
}

class Selection {
  keys = $state<string[]>([]);
  slots = $state<Record<string, number>>({});
  custom = $state<CustomModel>({ enabled: false, H0: 70, Om: 0.3, w0: -1, wa: 0 });
  initialised = $state(false);

  init(defaultKeys: string[]) {
    if (this.initialised) return;
    this.initialised = true;
    for (const k of defaultKeys.slice(0, MAX_MODELS)) this.add(k);
  }

  has(key: string) {
    return this.keys.includes(key);
  }

  add(key: string) {
    if (this.has(key) || this.keys.length >= MAX_MODELS) return false;
    const used = new Set(Object.values(this.slots));
    let slot = 0;
    while (used.has(slot)) slot++;
    this.slots = { ...this.slots, [key]: slot };
    this.keys = [...this.keys, key];
    return true;
  }

  remove(key: string) {
    if (!this.has(key)) return;
    const { [key]: _, ...rest } = this.slots;
    this.slots = rest;
    this.keys = this.keys.filter((k) => k !== key);
  }

  toggle(key: string) {
    if (this.has(key)) this.remove(key);
    else this.add(key);
  }

  colorOf(key: string): string {
    const s = this.slots[key];
    return s === undefined ? '#ffffff' : MODEL_COLORS[s];
  }

  get full() {
    return this.keys.length >= MAX_MODELS;
  }
}

export const selection = new Selection();
