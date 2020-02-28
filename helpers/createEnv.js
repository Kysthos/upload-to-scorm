const config = require("../config.json");
const ENV_PATH = config.ENV_PATH;
const { join } = require("path");
const { promises: fs, createWriteStream } = require("fs");

const dev = process.argv[2];

main();

async function main() {
  for (const site of config.SITES) {
    if (dev && "DEV" !== site.NAME) continue;
    const siteName = site.NAME;
    const envFolder = join(ENV_PATH, siteName);
    try {
      await fs.mkdir(envFolder);
    } catch (e) {}
    const envFile = join(envFolder, ".env");
    const envStream = createWriteStream(envFile);
    for (const [key, val] of Object.entries(site.ENV))
      envStream.write(`${key}=${val}\n`);
    envStream.end();
    console.log(`${envFile} created.`);
  }
}
