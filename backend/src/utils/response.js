export function sendOk(res, data, { status = 200, meta, message } = {}) {
  const body = { success: true, data: data ?? null };
  if (meta) body.meta = meta;
  if (message) body.message = message;
  return res.status(status).json(body);
}

export const sendCreated = (res, data, options = {}) => sendOk(res, data, { ...options, status: 201 });
