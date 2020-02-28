const dirs = [
  ...new Set(require("../config.json").SITES.map(el => el.ENV.SCORM_LOG_PATH))
];

const async = require("async");
const { pipeline } = require("stream");
const path = require("path");
const { promises: fs, createReadStream } = require("fs");
const cpuLen = require("os").cpus().length;
const split = require("split2");
const Log = require("./logUtilities/logParser");
const LogStore = require("./logUtilities/logStore");
const bytes = require("bytes");

const store = new LogStore();

Promise.all(dirs.map(folder => readLogs(folder))).then(() => {
  console.log(store.getUsers());
  console.log(store.get("duration"));
  console.log(store.getAverage("duration"));
  console.log(store.getMedian("duration"));
  console.log(store.getBiggest("duration"));
  console.log(store.getLowest("duration"));
  console.log(store.length);

  const users = store.getUsers();
  const userStores = {};
  for (const user of users) 
    userStores[user] = store.get('user', user);

  console.log(userStores)

  // console.log(store.getStats());
});

async function readLogs(dir) {
  try {
    // get all logs
    const logs = (await fs.readdir(dir))
      .filter(el => path.extname(el).toUpperCase() === ".LOG")
      .map(el => path.join(dir, el));
    // parse each log
    await async.eachLimit(
      logs,
      cpuLen,
      async log =>
        new Promise((resolve, reject) => {
          const parser = new Log(log);
          pipeline(createReadStream(log), split(), parser, err => {
            store.add(parser);
            if (err) return reject(err);
            resolve();
          });
        })
    );
  } catch(err) {
    console.error(`Error while processing: ${dir}. ${err.message}`)
  }
}
