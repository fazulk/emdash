export function shouldApplyPtyReplay(result: {
  ok: boolean;
  reused?: boolean;
  replay?: { data: string; cols: number; rows: number };
} | null | undefined): boolean {
  if (!result?.replay) return false;
  if (!result.ok) return true;
  return result.reused === true;
}
