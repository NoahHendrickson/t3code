import { createContext } from "react";

/**
 * Props the model picker's root popup carries into its submenus — the
 * composer floating-layer marker when the composer owns the picker, nothing in
 * Settings. Each submenu portals out of the root popup, so it has to restamp
 * them itself. See `.fork/customizations.yaml#fork-model-picker`.
 */
export const ModelPickerFloatingLayerContext = createContext<Readonly<Record<string, string>>>({});
