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
