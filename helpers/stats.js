// set threadpool size to the number of cpu cores
// this will be the number of concurrent log streams
const cpuLen = require("os").cpus().length;
process.env.UV_THREADPOOL_SIZE = cpuLen;

const async = require("async");
const path = require("path");
const { promises: fs, createReadStream } = require("fs");
const split = require("split2");
const Log = require("./logUtilities/logParser");
const LogStore = require("./logUtilities/logStore");
const ProgressBar = require("progress");
const chalk = require("chalk");
const { promisify } = require("util");
const pipeline = promisify(require("stream").pipeline);

// get all log directories from the config file
const config = require("../config.json");
const dirs = [
  ...new Set(
    config.SITES.map(el => el.ENV.SCORM_LOG_PATH).concat(config.OLD_LOGS || [])
  )
];

const store = new LogStore();

main();

async function main() {
  // process all log files
  await populateStore(dirs);
  // group all logs
  const error = store.get(log => log.error);
  const unfinished = store.get(log => !log.finished && !log.error);
  const success = store.get(log => !log.error && log.finished);
  success.displayStats();
  const users = {};
  success.getUsers().map(user => (users[user] = success.get("user", user)));
  for (const userStore of Object.values(users)) userStore.displayStats();

  console.log(
    `Total: ${store.length}. Success: ${success.length} (${(
      (success.length / store.length) *
      100
    ).toFixed(2)}%). Unfinished: ${unfinished.length} (${(
      (unfinished.length / store.length) *
      100
    ).toFixed(2)}%). Error: ${error.length} (${(
      (error.length / store.length) *
      100
    ).toFixed(2)}%)`
  );
}

async function populateStore(dirs) {
  // concatenate all log file paths to one array
  let paths = (await Promise.all(dirs.map(d => getLogPaths(d))))
    .filter(d => d)
    .flat();
  // read all logs and populate the log store
  await readLogs(paths);
}

// get all logs from a directory
async function getLogPaths(dir) {
  try {
    return (await fs.readdir(dir))
      .filter(el => el && path.extname(el).match(/\.LOG/i))
      .map(f => path.join(dir, f));
  } catch (err) {
    console.error(`Skipping ${chalk.red(dir)}: ${err.message}`);
  }
}

async function readLogs(logs) {
  try {
    const bar = new ProgressBar(
      "Parsing logs [:bar] :current/:total (:percent) [:elapsed s] :rate logs/s",
      {
        total: logs.length,
        width: 25,
        complete: chalk.green("="),
        incomplete: chalk.grey("-")
      }
    );
    // parse all logs
    await async.eachLimit(logs, cpuLen, async log => {
      // Log class extends Writable stream, so we can pipe it
      const parser = new Log(log);
      await pipeline(createReadStream(log), split(), parser);
      bar.tick();
      store.add(parser);
    });
    console.log(
      `Parsed ${chalk.yellow(
        store.logs.reduce((a, log) => a + log.lines.length, 0)
      )} lines of logs!`
    );
  } catch (err) {
    console.error(`Error while processing: ${err.message}`);
  }
}
