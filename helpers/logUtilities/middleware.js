// this is mainly just as for an exercise

// (obj, next) => {}

module.exports = class MiddlewareManager {
  constructor() {
    this.middlewares = {}
  }

  use(prop, fn) {
    if (!this.checkProp(prop))
      this.middlewares[prop] = [];
    this.middlewares[prop].push(fn);
  }

  start(prop) {
    if (!this.checkProp(prop)) return false;
    let i = 0;
    const obj = {};
    const next = () => {
      const nextFn = this.middlewares[prop][++i];
      if (typeof nextFn === 'function') return nextFn(obj, next);
    };
    const firstFn = this.middlewares[prop][0];
    if (typeof firstFn === 'function') firstFn(obj, next);
    return obj;
  }

  checkProp(prop) {
    return prop in this.middlewares;
  }
}