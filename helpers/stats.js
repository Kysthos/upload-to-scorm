const async = require("async");
const {
  pipeline
} = require("stream");
const path = require("path");
const {
  promises: fs,
  createReadStream
} = require("fs");
const cpuLen = require("os").cpus().length;
const split = require("split2");
const Log = require("./logUtilities/logParser");
const LogStore = require("./logUtilities/logStore");
const ProgressBar = require('progress');
const chalk = require('chalk')

// get all log directories from the config file
const dirs = [
  ...new Set(require("../config.json").SITES.map(el => el.ENV.SCORM_LOG_PATH))
];

const store = new LogStore();

main();

async function main() {
  // process all log files
  await populateStore(dirs);
  // group all logs
  const error = store.get(log => log.error)
  const unfinished = store.get(log => !log.finished && !log.error)
  const success = store.get(log => !log.error && log.finished)
  console.log(`Errors: ${error.length}`)
}

async function populateStore(dirs) {
  // concatenate all log file paths to one array
  let paths = (await Promise.all(dirs.map(d => getLogPaths(d))))
    .filter(d => d)
    .flat()
  // read all logs and populate the log store
  await readLogs(paths);
}

// get all logs from a directory
async function getLogPaths(dir) {
  try {
    return (await fs.readdir(dir))
      .filter(el => el && path.extname(el).toUpperCase() === '.LOG')
      .map(f => path.join(dir, f));
  } catch (err) {
    console.error(`Skipping ${chalk.red(dir)}: ${err.message}`);
  }
}

async function readLogs(logs) {
  try {
    const bar = new ProgressBar('Parsing logs [:bar] :current/:total (:percent) [:elapsed s]', {
      total: logs.length,
      width: 25,
      complete: chalk.green('='),
      incomplete: chalk.grey('-')
    });
    // parse all logs
    await async.eachLimit(
      logs,
      cpuLen,
      async log =>
        new Promise((resolve, reject) => {
          // Log class extends Writable stream, so we can pipe it
          const parser = new Log(log);
          pipeline(
            createReadStream(log),
            split(),
            parser,
            err => {
              bar.tick();
              if (err) return reject(err);
              store.add(parser);
              resolve();
            });
        })
    );
    console.log(`Parsed ${chalk.yellow(store.logs.reduce((a, log) => a + log.lines.length, 0))} lines of logs!`)
  } catch (err) {
    console.error(`Error while processing: ${err.message}`);
  }
}