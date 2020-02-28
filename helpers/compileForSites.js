const { exec } = require("pkg");
const config = require("../config.json");
const { join } = require("path");
const fs = require("fs").promises;

const envName = ".env";
const exeName = "uploadToScorm.exe";

const dev = process.argv[2];

main();

async function main() {
  const outputExe = join(config.COMPILED_PATH, exeName);
  console.log("COMPILING...");
  await exec(["index.js", "--targets=node12-win-x64", `--output=${outputExe}`]);
  console.log("COMPILED!");
  const sites = config.SITES;
  const envPath = config.ENV_PATH;
  for (const site of sites) {
    if (dev && "DEV" !== site.NAME) continue;
    console.log(`\nPROCESSING SITE: ${site.NAME}\n`);
    const envForSite = join(envPath, site.NAME, envName);
    const targetPath = site.COMPILED_PATH;
    await Promise.all([
      copy(outputExe, join(targetPath, exeName)),
      copy(envForSite, join(targetPath, envName))
    ]);
  }
}

async function copy(source, target) {
  try {
    await fs.copyFile(source, target);
    console.log(`Copied ${source} to ${target}`);
  } catch (e) {
    console.log(
      `ERROR! Couldn't copy ${source} to ${target}. Reason: ${e.message}`
    );
  }
}
