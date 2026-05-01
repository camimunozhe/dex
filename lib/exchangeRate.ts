let cachedRate: number | null = null;

export async function getUsdToClp(): Promise<number> {
  if (cachedRate !== null) return cachedRate;
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    const json = await res.json();
    cachedRate = typeof json.rates?.CLP === 'number' ? json.rates.CLP : 950;
  } catch {
    cachedRate = 950;
  }
  return cachedRate!;
}
