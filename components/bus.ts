/** Handles that components register so others (keyboard shortcuts, buttons) can call them. */
export const bus: {
  goPage?: (delta: number | "first" | "last") => void;
  ruler?: { activate(): void; close(): void; step(d: number): void; choose(): void; isActive(): boolean };
  focusSearch?: () => void;
  pickCSV?: () => void;
  pickJSON?: () => void;
  pickImage?: (target: { kind: "b" | "f"; id: string }) => void;
  deselect?: () => void;
} = {};
