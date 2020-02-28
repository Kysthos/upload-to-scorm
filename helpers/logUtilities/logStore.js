const Log = require("./logParser");
class LogStore {
  constructor(init) {
    this.logs = [];
    if (Array.isArray(init)) init.forEach(log => this.add(log));
  }

  get length() {
    return this.logs.length;
  }

  add(log) {
    if (!(log instanceof Log)) return false;
    this.logs.push(log);
  }

  getUsers() {
    return [...new Set(this.get("user"))].sort();
  }

  getAverage(prop) {
    const props = this.get(prop);
    return props.reduce((a, b) => a + b) / props.length;
  }

  getMedian(prop) {
    const props = this.get(prop);
    props.sort((a, b) => a - b);
    return props[Math.floor(props.length / 2)];
  }

  getBiggest(prop) {
    return Math.max(...this.get(prop));
  }

  getLowest(prop) {
    return Math.min(...this.get(prop));
  }

  get(prop, val = null) {
    if (val === null)
      return this.logs
        .map(log => log.data[prop])
        .filter(el => el !== undefined)
        .sort();
    return new LogStore(this.logs.filter(log => log.data[prop] === val));
  }

  getStats() {
    const keys = Object.keys(this.logs[0].data)
    console.log(keys)
  }
}

module.exports = LogStore;
