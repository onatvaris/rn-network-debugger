export function createReduxMiddleware(emitter) {
  return store => next => action => {
    if (!emitter) return next(action);
    const prevState = store.getState();
    const start = Date.now();
    const result = next(action);
    const nextState = store.getState();
    try {
      emitter.onReduxAction({
        actionType: action?.type ?? '(unknown)',
        payload: action?.payload ?? action?.data,
        action,
        prevState,
        nextState,
        duration: Date.now() - start,
      });
    } catch {}
    return result;
  };
}
