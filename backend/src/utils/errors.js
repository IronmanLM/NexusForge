export function sendError(res, status, code, message, details) {
  const payload = {
    error: {
      code,
      message
    }
  };

  if (details && typeof details === 'object') {
    payload.error.details = details;
  }

  return res.status(status).json(payload);
}
