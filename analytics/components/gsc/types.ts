export type MetricKey = 'clicks' | 'impressions' | 'ctr' | 'position';

export type DimensionKey =
  | 'query'
  | 'page'
  | 'country'
  | 'device'
  | 'date'
  | 'searchAppearance';

export type SearchType =
  | 'web'
  | 'image'
  | 'video'
  | 'news'
  | 'discover'
  | 'googleNews';

export type GscFilter = {
  dimension: 'query' | 'page' | 'country' | 'device';
  operator:
    | 'equals'
    | 'notEquals'
    | 'contains'
    | 'notContains'
    | 'includingRegex'
    | 'excludingRegex';
  expression: string;
};

export type QueryResponse = {
  rows: Array<{
    keys: string[];
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>;
  totalRows: number;
  totals: {
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  };
};

export const METRIC_META: Record<
  MetricKey,
  { label: string; color: string; format: (v: number) => string }
> = {
  clicks: {
    label: 'Clics',
    color: '#3b82f6', // blue-500
    format: (v) => new Intl.NumberFormat('fr-FR').format(Math.round(v)),
  },
  impressions: {
    label: 'Impressions',
    color: '#8b5cf6', // violet-500
    format: (v) => new Intl.NumberFormat('fr-FR').format(Math.round(v)),
  },
  ctr: {
    label: 'CTR',
    color: '#10b981', // emerald-500
    format: (v) => (v * 100).toFixed(1) + '%',
  },
  position: {
    label: 'Position',
    color: '#f59e0b', // amber-500
    format: (v) => v.toFixed(1),
  },
};

export const DIMENSION_META: Record<
  DimensionKey,
  { label: string; icon: string }
> = {
  query: { label: 'Requêtes', icon: '🔎' },
  page: { label: 'Pages', icon: '📄' },
  country: { label: 'Pays', icon: '🌍' },
  device: { label: 'Appareils', icon: '💻' },
  date: { label: 'Dates', icon: '📅' },
  searchAppearance: { label: 'Apparence', icon: '✨' },
};

export const DATE_RANGES: Array<{ value: string; label: string; days: number }> =
  [
    { value: '7d', label: '7 derniers jours', days: 7 },
    { value: '28d', label: '28 derniers jours', days: 28 },
    { value: '3m', label: '3 derniers mois', days: 90 },
    { value: '6m', label: '6 derniers mois', days: 180 },
    { value: '12m', label: '12 derniers mois', days: 365 },
    { value: '16m', label: '16 derniers mois', days: 480 },
  ];

export const SEARCH_TYPES: Array<{ value: SearchType; label: string }> = [
  { value: 'web', label: 'Web' },
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Vidéo' },
  { value: 'news', label: 'Actualités' },
];
