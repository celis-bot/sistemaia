import { z } from 'zod';

// Uso: validate({ body: schema, query: schema, params: schema })
// Cada parte es opcional; solo se valida lo proporcionado.
export function validate(schemas) {
  const { body, query, params } = schemas;
  return (req, _res, next) => {
    try {
      if (body) req.body = body.parse(req.body ?? {});
      if (query) req.query = query.parse(req.query ?? {});
      if (params) req.params = params.parse(req.params ?? {});
      next();
    } catch (err) {
      next(err);
    }
  };
}

// Atajo para solo body
export const body = (schema) => validate({ body: schema });

export const idParam = z.object({ id: z.string().uuid() });
