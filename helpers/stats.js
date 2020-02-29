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
const bytes = require("bytes");

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
    console.error(`Skipping ${dir}: ${err.message}`);
  }
}

async function readLogs(logs) {
  try {
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
              if (err) return reject(err);
              store.add(parser);
              resolve();
            });
        })
    );
  } catch (err) {
    console.error(`Error while processing: ${err.message}`);
  }
}