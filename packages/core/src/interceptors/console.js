const LEVELS = ['log', 'warn', 'error', 'info'];

function isReduxLoggerMsg(args) {
  const first = args[0];
  return typeof first === 'string' && first.startsWith('%c ') && typeof args[1] === 'string' && args[1].includes('font-weight');
}

function stripCssArgs(args) {
  if (typeof args[0] === 'string' && args[0].startsWith('%c')) {
    const label = args[0].replace(/^%c\s*/, '');
    const rest = args.slice(1).filter(a => !(typeof a === 'string' && (a.includes('font-weight') || a.includes('color:'))));
    return [label, ...rest];
  }
  return args;
}

export function interceptConsole(emitter) {
  const originals = {};
  let reduxBuffer = null;

  LEVELS.forEach(level => {
    originals[level] = console[level].bind(console);
    console[level] = (...args) => {
      originals[level](...args);
      try {
        if (isReduxLoggerMsg(args)) {
          const label = args[0].replace(/^%c\s*/, '').trim().toLowerCase();
          const value = args[2];
          if (label === 'prev state') {
            reduxBuffer = { prevState: value, action: null, nextState: null };
          } else if (label === 'action' && reduxBuffer) {
            reduxBuffer.action = value;
          } else if (label === 'next state' && reduxBuffer?.action) {
            reduxBuffer.nextState = value;
            emitter.onReduxAction({
              actionType: reduxBuffer.action?.type ?? '(unknown)',
              payload: reduxBuffer.action?.payload ?? reduxBuffer.action?.data,
              action: reduxBuffer.action,
              prevState: reduxBuffer.prevState,
              nextState: reduxBuffer.nextState,
              duration: null,
            });
            reduxBuffer = null;
          } else {
            reduxBuffer = null;
          }
          return;
        }
        reduxBuffer = null;
        emitter.onConsoleLog(level, stripCssArgs(args));
      } catch {}
    };
  });

  return () => {
    LEVELS.forEach(level => { console[level] = originals[level]; });
  };
}
