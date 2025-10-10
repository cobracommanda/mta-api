const ROUTE_EQUIV = {
  '5X': '5',
  '6X': '6',
  '7X': '7',
  'GS': 'S',
  'FS': 'S',
};

const ROUTE_RULES = {
  '1': [
    { prefix: '', min: 101, max: 199 },
  ],
  '2': [
    { prefix: '', min: 201, max: 299 },
  ],
  '3': [
    { prefix: '', min: 301, max: 399 },
  ],
  '4': [
    { prefix: '', min: 401, max: 499 },
  ],
  '5': [
    { prefix: '', min: 201, max: 299 },
    { prefix: '', min: 401, max: 499 },
    { prefix: '', min: 501, max: 599 },
  ],
  '6': [
    { prefix: '', min: 601, max: 699 },
  ],
  '7': [
    { prefix: '', min: 701, max: 799 },
  ],
  'S': [
    { prefix: '', min: 901, max: 999 },
  ],
  N: [
    { prefix: 'N' },
    { prefix: 'R', min: 1, max: 21 },
  ],
  Q: [
    { prefix: 'Q' },
    { prefix: 'R', min: 13, max: 21 },
    { prefix: 'D', min: 24, max: 43 },
  ],
  R: [
    { prefix: 'R', min: 13, max: 45 },
  ],
  W: [
    { prefix: 'R', min: 1, max: 27 },
  ],
};

const ROUTE_TOKENS_CACHE = new Map();

function tokenizeRouteString(str) {
  if (!str) return [];
  const key = str.toUpperCase();
  if (ROUTE_TOKENS_CACHE.has(key)) return ROUTE_TOKENS_CACHE.get(key);
  const tokens = key.split(/[^A-Z0-9]+/).filter(Boolean);
  ROUTE_TOKENS_CACHE.set(key, tokens);
  return tokens;
}

function normalizeRoute(routeId) {
  if (!routeId) return null;
  const upper = routeId.toUpperCase();
  return ROUTE_EQUIV[upper] || upper;
}

function extractBaseCode(stop) {
  if (!stop) return { code: '', prefix: '', number: null };
  const parent = (stop.parent || '').toString();
  const ownId = (stop.id || '').toString();
  const raw = parent || ownId;
  if (!raw) return { code: '', prefix: '', number: null };
  const code = raw.toUpperCase();
  const prefixMatch = code.match(/^[A-Z]+/);
  const prefix = prefixMatch ? prefixMatch[0] : '';
  const numberMatch = code.slice(prefix.length).match(/^\d+/);
  const number = numberMatch ? Number(numberMatch[0]) : null;
  return { code, prefix, number };
}

function codeMatchesRule(rule, prefix, number) {
  if (rule.prefix && rule.prefix !== prefix) return false;
  if (rule.min != null && (number == null || number < rule.min)) return false;
  if (rule.max != null && (number == null || number > rule.max)) return false;
  return true;
}

function codeTokens(code) {
  return [...code.matchAll(/([A-Z]+|\d+)/g)].map(m => m[1]);
}

export function stopServesRoute(stop, routeId) {
  const normalized = normalizeRoute(routeId);
  if (!normalized) return false;

  const directTokens = tokenizeRouteString(stop?.routes || '');
  if (directTokens.includes(normalized)) return true;

  const { code, prefix, number } = extractBaseCode(stop);
  const rules = ROUTE_RULES[normalized];
  if (rules?.some(rule => codeMatchesRule(rule, prefix, number))) {
    return true;
  }

  // Fallback: if we have no explicit rules, check code tokens for the route ID.
  if (!rules) {
    const tokens = codeTokens(code);
    for (const token of tokens) {
      if (token === normalized) return true;
    }
  }

  return false;
}

export function filterStopsByRoute(stops, routeId) {
  const normalized = normalizeRoute(routeId);
  if (!normalized) return [];
  return stops.filter(stop => stopServesRoute(stop, normalized));
}

