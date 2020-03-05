class Loading {
  constructor() {
    this.frames = ["  /", "  —", "  \\", "  |"];
    this.current = 0;
    this.interval;
    this.running = false;
  }

  start() {
    this.running = true;
    this.interval = setInterval(() => {
      Promise.resolve().then(() => this._write());
    }, 100);
  }
  _write() {
    process.stdout.write(
      `\r${this.frames[this.current++ % this.frames.length]}`
    );
  }
  stop() {
    clearInterval(this.interval);
    process.stdout.write("\r");
    this.running = false;
    return new Promise((resolve, reject) => {
      process.stdout.clearLine(0, () => {
        resolve();
      });
    });
  }
}

module.exports = new Loading();
