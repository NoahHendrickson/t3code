/**
 * Whether focus sits in an open model picker — see
 * `.fork/customizations.yaml#fork-model-picker`. The menu parks focus on its
 * popup as well as on rows inside the stamped content, so look both ways.
 * ProviderModelPicker stamps the reasoning panel too, so its slider, checkboxes
 * and segments count.
 */
const MODEL_PICKER_CONTENT_SELECTOR = "[data-model-picker-content]";

export function modelPickerHoldsFocus(): boolean {
  const active = typeof document === "undefined" ? null : document.activeElement;
  return Boolean(
    active?.closest?.(MODEL_PICKER_CONTENT_SELECTOR) ??
    active?.querySelector?.(MODEL_PICKER_CONTENT_SELECTOR),
  );
}
