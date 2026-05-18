export function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const text = String(value).trim();
  const negative = /^\(.*\)$/.test(text);
  const parsed = Number.parseFloat(text.replace(/[,\s฿]/g, "").replace(/[()]/g, ""));
  if (Number.isNaN(parsed)) return 0;
  return negative ? -parsed : parsed;
}

export function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = toNumber(value);
  return Number.isFinite(parsed) ? parsed : null;
}
