// Regiones de Chile (lanzamiento inicial). Más adelante se puede namespacing
// por país, p.ej. `CL-RM`, `CL-V`, etc.
export const CHILE_REGIONS = [
  { code: 'AP',   label: 'Arica y Parinacota' },
  { code: 'TA',   label: 'Tarapacá' },
  { code: 'AN',   label: 'Antofagasta' },
  { code: 'AT',   label: 'Atacama' },
  { code: 'CO',   label: 'Coquimbo' },
  { code: 'VS',   label: 'Valparaíso' },
  { code: 'RM',   label: 'Metropolitana' },
  { code: 'LI',   label: "O'Higgins" },
  { code: 'ML',   label: 'Maule' },
  { code: 'NB',   label: 'Ñuble' },
  { code: 'BI',   label: 'Biobío' },
  { code: 'AR',   label: 'La Araucanía' },
  { code: 'LR',   label: 'Los Ríos' },
  { code: 'LL',   label: 'Los Lagos' },
  { code: 'AI',   label: 'Aysén' },
  { code: 'MA',   label: 'Magallanes' },
] as const;

export type RegionCode = (typeof CHILE_REGIONS)[number]['code'];

export const REGION_LABEL: Record<string, string> = Object.fromEntries(
  CHILE_REGIONS.map(r => [r.code, r.label]),
);
