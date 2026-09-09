/** Settled threads show their return-to-active action before any other notice.
 * Other items stay available so un-settling restores them without dismissal.
 */
export function visibleComposerBannerItems<T extends { readonly id: string }>(
  items: ReadonlyArray<T>,
): ReadonlyArray<T> {
  const settledNotice = items.find((item) => item.id.startsWith("thread-settled:"));
  return settledNotice ? [settledNotice] : items;
}
