export const validate =
  ({ body, query, params } = {}) =>
  (req, res, next) => {
    req.valid = {
      body: body ? body.parse(req.body ?? {}) : undefined,
      query: query ? query.parse(req.query ?? {}) : undefined,
      params: params ? params.parse(req.params ?? {}) : undefined,
    };
    next();
  };
