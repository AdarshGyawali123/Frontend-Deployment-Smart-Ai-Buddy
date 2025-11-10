type Events = {
  "notes:changed": { noteId?: string } // fire after upload/index/delete
};

const listeners: { [K in keyof Events]?: Array<(p: Events[K]) => void> } = {};

export function on<K extends keyof Events>(event: K, cb: (payload: Events[K]) => void) {
  (listeners[event] ||= []).push(cb);
  return () => off(event, cb);
}

export function off<K extends keyof Events>(event: K, cb: (payload: Events[K]) => void) {
  const arr = listeners[event];
  if (!arr) return;
  const i = arr.indexOf(cb);
  if (i >= 0) arr.splice(i, 1);
}

export function emit<K extends keyof Events>(event: K, payload: Events[K]) {
  const arr = listeners[event];
  if (!arr) return;
  arr.forEach((fn) => fn(payload));
}
