// Express 4 does not forward rejected async handlers automatically.
export function asyncApp(app) {
  const wrap = (handler) => {
    if (Array.isArray(handler)) return handler.map(wrap);
    if (typeof handler !== 'function' || handler.length === 4) return handler;
    return function (req, res, next) {
      Promise.resolve()
        .then(() => handler(req, res, next))
        .catch(next);
    };
  };
  for (const method of ['use', 'get', 'post', 'put', 'patch', 'delete']) {
    const original = app[method].bind(app);
    app[method] = (...args) => original(...args.map(wrap));
  }
  return app;
}
