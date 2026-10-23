/**
 * Glass's tint and its three alphas, read from the one block that declares
 * them under the vibrancy marker (theme.custom.palettes.css). Guards assert
 * relationships between these rather than grepping literal colours out of
 * each surface, so a retune changes the block and nothing else.
 */
export function glassTokens(palettes: string) {
  const declared = (name: string) =>
    new RegExp(`${name}:\\s*([^;]+);`, "u").exec(palettes)?.[1]?.trim();
  const percent = (name: string) =>
    Number(/^(\d+)%$/u.exec(declared(name) ?? "")?.[1] ?? Number.NaN);
  return {
    tint: (declared("--fork-glass-tint") ?? "").split(/\s+/u).map(Number),
    panel: percent("--fork-glass-panel-alpha"),
    stage: percent("--fork-glass-stage-alpha"),
    card: percent("--fork-glass-card-alpha"),
  };
}
