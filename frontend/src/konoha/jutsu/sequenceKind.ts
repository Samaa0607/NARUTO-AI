// "Official" / "Custom" and what it means (the catalog's `official` flag).
export function sequenceKind(official: boolean): { label: string; meaning: string } {
  return official
    ? { label: 'Official seals', meaning: 'The original hand seals, in their original order.' }
    : { label: 'Custom sequence', meaning: 'Designed for SHINOBI AI: the source has fewer than four seals.' }
}
