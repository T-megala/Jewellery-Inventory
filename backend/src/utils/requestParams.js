const extractValue = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'object' && value.name !== undefined && value.name !== null) {
    const name = String(value.name).trim();
    return name || null;
  }

  const text = String(value).trim();

  if (!text || text === '[object Object]') {
    return null;
  }

  return text;
};

const splitParamValues = (value) => {
  if (value === undefined || value === null) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => splitParamValues(entry));
  }

  const text = extractValue(value);
  if (!text) {
    return [];
  }

  return text
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
};

export const getRequestStringList = (req, ...keys) => {
  const values = [];

  for (const key of keys) {
    const fromQuery = req.query?.[key];
    if (fromQuery !== undefined && fromQuery !== null) {
      values.push(...splitParamValues(fromQuery));
    }

    const fromBody = req.body?.[key];
    if (fromBody !== undefined && fromBody !== null) {
      values.push(...splitParamValues(fromBody));
    }
  }

  return [...new Set(values)];
};

export const getRequestParam = (req, ...keys) => {
  for (const key of keys) {
    const fromQuery = extractValue(req.query?.[key]);
    if (fromQuery) {
      return fromQuery;
    }

    const fromBody = extractValue(req.body?.[key]);
    if (fromBody) {
      return fromBody;
    }
  }

  return null;
};
