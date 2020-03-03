const bytes = require("bytes");
const moment = require("moment");
const Log = require("./logParser");
const MiddlewareManager = require("./middleware");
const chalk = require("chalk");

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

  calcAverage(prop) {
    const props = this.get(prop);
    return props.reduce((a, b) => a + b) / props.length;
  }

  calcMedian(prop) {
    const props = this.get(prop);
    props.sort((a, b) => a - b);
    if (props.length % 2 !== 0) return props[Math.floor(props.length / 2)];
    const index = props.length / 2;
    return (props[index] + props[index - 1]) / 2;
  }

  calcBiggest(prop) {
    return Math.max(...this.get(prop));
  }

  calcLowest(prop) {
    return Math.min(...this.get(prop));
  }

  get(prop, val = null) {
    if (typeof prop === "function")
      return new LogStore(this.logs.filter((log, i) => prop(log.data, i)));
    if (val === null)
      return this.logs
        .map(log => log.data[prop])
        .filter(el => el !== undefined)
        .sort();
    return new LogStore(this.logs.filter(log => log.data[prop] === val));
  }

  getStats() {
    const manager = new MiddlewareManager();
    const stats = {
      total: this.length
    };

    const forStats = [
      "zipSize",
      "duration",
      "uploadTime",
      "scormProcessingTime"
    ];
    const valuesToGet = ["average", "median", "biggest", "lowest"];

    const reg = /^(.{1})(.+)$/;
    const firstUpper = (match, p1, p2) => `${p1.toUpperCase()}${p2}`;
    for (const stat of forStats)
      for (const value of valuesToGet) {
        const fnName = `calc${value.replace(reg, firstUpper)}`;
        manager.use(stat, (obj, next) => {
          obj[value] = this[fnName](stat);
          obj.total = this.get(stat).reduce((a, b) => a + b, 0);
          next();
        });
      }

    // stats middlewares
    const toBytes = (obj, next) => {
      for (const value of valuesToGet) obj[value] = bytes(obj[value]);
      obj.total = bytes(obj.total);
      next();
    };
    const humanizeDuration = (obj, next) => {
      for (const value of valuesToGet)
        obj[value] = this.getDurationString(moment.duration(obj[value]));
      obj.total = this.getDurationString(moment.duration(obj.total));
      next();
    };

    manager.use("zipSize", toBytes);
    manager.use("duration", humanizeDuration);
    manager.use("uploadTime", humanizeDuration);
    manager.use("scormProcessingTime", humanizeDuration);

    for (const stat of forStats) stats[stat] = manager.start(stat);

    return stats;
  }

  getDurationString(duration, colors = true) {
    const data = {
      days: { short: "d", color: "red" },
      hours: { short: "h", color: "yellow" },
      minutes: { short: "m", color: "blue" },
      seconds: { short: "s", color: "magenta" },
      milliseconds: { short: "ms", color: "green" }
    };
    const text = [];
    for (const [fnName, params] of Object.entries(data)) {
      const dur = duration[fnName]();
      if (dur > 0) {
        const str = `${dur} ${params.short}`;
        text.push(colors ? chalk[params.color](str) : str);
      }
    }
    return text.join(" ");
  }

  displayStats() {
    const stats = this.getStats();
    const users = this.getUsers();
    const user = users.length === 1 ? users[0] : `[ ${users.join(", ")} ]`;
    console.log();
    console.log(`Displaying stats for ${chalk.magenta(user)}.`);
    console.log("=".repeat(50));
    console.log(`Total number of operations ${chalk.green(stats.total)}.`);
    for (const [field, data] of Object.entries(stats)) {
      if (field === "total") continue;
      console.log(`${" ".repeat(2)}${chalk.red(field)}:`);
      for (const [stat, val] of Object.entries(data)) {
        console.log(" ".repeat(4), stat + ":", val);
      }
    }
    console.log("=".repeat(50));
    console.log();
  }

  toJSON() {
    return this.logs;
  }

  *[Symbol.iterator]() {
    for (const log of this.logs) yield log;
  }
}

module.exports = LogStore;
