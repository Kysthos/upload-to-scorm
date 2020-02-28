// import scorm modules
const defaultClient = require("@rusticisoftware/scormcloud-api-v2-client-javascript/src/rustici-software-cloud-v2/ApiClient")
  .instance;
const courseApi = new (require("@rusticisoftware/scormcloud-api-v2-client-javascript/src/rustici-software-cloud-v2/rustici-software-cloud-v2-api/CourseApi"))(
  defaultClient
);
const invitationsApi = new (require("@rusticisoftware/scormcloud-api-v2-client-javascript/src/rustici-software-cloud-v2/rustici-software-cloud-v2-api/InvitationsApi"))(
  defaultClient
);

// set higher timeout for requests
defaultClient.timeout = 1000 * 60 * 5;

// import other modules
const path = require("path");
const { promises: fs, createReadStream, createWriteStream } = require("fs");
const writeFile = fs.writeFile;
const stat = fs.stat;
const { promisify } = require("util");
const sleep = promisify(setTimeout);
const bytes = require("bytes");
const loading = require('./Loading')

// set up env vars
// require("dotenv").config();
require("dotenv").config({
  path: path.join(path.parse(process.argv0).dir, ".env")
});

// get env variables added by dotenv
const SCORM_APP_NAME = process.env.SCORM_APP_NAME;
const SCORM_APP_KEY = process.env.SCORM_APP_KEY;
const SCORM_LINK_NAME = process.env.SCORM_LINK_NAME;
const SCORM_INVITATION_MAIL = process.env.SCORM_INVITATION_MAIL;
const LOG_PATH = process.env.SCORM_LOG_PATH;

// set debugging and output coloring
const debug = require("debug")("PUBLISH");
const chalk = require("chalk");
const stripAnsi = require("strip-ansi");

// create log stream
const USER = require("os").userInfo().username;
const LOG_STREAM = createWriteStream(
  path.join(LOG_PATH, `${USER}_${Date.now()}.log`)
);
// we'll skip silently over any log errors
LOG_STREAM.on("error", () => {});

// time we'll wait for the course to upload after creating a job
const UPLOAD_TIMEOUT = 1000 * 60 * 10; // 10 min
// interval for checking if course has been uploaded after creating a job
const CHECK_IF_UPLOADED_INTERVAL = 2000; // 2 s

// authentication
const APP_NORMAL = defaultClient.authentications["APP_NORMAL"];
APP_NORMAL.username = SCORM_APP_NAME;
APP_NORMAL.password = SCORM_APP_KEY;

// file to upload
const course = process.argv[2];

// check if extension is zip, if so, start
if (!course || path.parse(course).ext.toUpperCase() !== ".ZIP") {
  handleError(`${course} is not a zip file!`);
} else {
  main();
}

async function main() {
  try {
    // generate id
    const id = generateId();

    // start import job
    const file = createReadStream(course);
    const stats = await stat(course);
    log(`Uploading ${chalk.yellow(course)}. This might take a while`);
    log(`Zip size: ${chalk.yellow(bytes(stats.size))}.`);

    loading.start();

    const uploaded = await upload(id, {
      mayCreateNewVersion: false,
      file: file
    });
    // store job id
    const jobId = uploaded.data.result;
    
    await loading.stop();

    log(`Job id assigned: ${chalk.yellow(jobId)}. Uploading.`);
    loading.start();
    // let's check every few seconds if course is already uploaded
    let checkIfUploaded = true;
    const start = Date.now();
    let lastMsg = "";
    while (checkIfUploaded) {
      if (Date.now() - start >= UPLOAD_TIMEOUT) {
        await loading.stop();
        return log("Request timed out!");
      }
      // wait before each job status check
      await sleep(CHECK_IF_UPLOADED_INTERVAL);
      const check = await checkJobStatus(jobId);
      // when course upload failed
      if (check.data.status.toUpperCase() == "ERROR") {
        await loading.stop();
        return handleError(
          check.data.message,
          check.res.statusCode,
          "getImportJobStatus"
        );
      }
      // on successful upload
      else if (check.data.status.toUpperCase() == "COMPLETE") {
        await loading.stop();
        checkIfUploaded = false;
        log(
          `Course "${chalk.yellow(check.data.importResult.course.title)}" uploaded successfully!`
        );
      } else if (check.data.message !== lastMsg) {
        await loading.stop();
        lastMsg = check.data.message;
        log(
          `Current upload status: ${check.data.status}. ${check.data.message}`
        );
        loading.start();
      }
    }
    // we can now request invitation link
    log(`Requesting invitation link.`);
    const invitation = await getInvitation(id);
    const link = invitation.data.url;
    const linkFile = path.join(path.parse(course).dir, SCORM_LINK_NAME);
    log(`Invitation link generated: ${chalk.yellow(link)}.`);
    // write invitation to link file
    await writeFile(linkFile, link);
    log(`Link saved to ${chalk.yellow(linkFile)}`);
    // we're waiting for user input to keep the terminal window open
    // so the user can actually see if everything went well or not
    exit(0);
  } catch (error) {
    if (error.type) {
      const { err, res = {}, type = undefined } = error;
      handleError(err.message, res.statusCode, type);
    } else {
      handleError(error.message);
    }
  }
}

// generates a random id which aims to be unique each time user starts the process
function generateId() {
  const random = (min, max) => Math.floor(Math.random() * (max - min)) + min;
  let id = [];
  const now = Date.now();
  // first part is the current date timestamp
  id.push(now);
  // just some shenanigans, probably not so random :P
  id.push(
    Math.round((now * random(10, 100)) / Math.min(process.pid, 0xffffff))
  );
  // add one random number just in case
  id.push(random(0x100000, 0xffffff));
  //  change all to hex
  id = id.map(n => n.toString(16)).join("-");
  log(`Generated new id for the course: ${id}`);
  return id;
}

function handleError(msg, statusCode, type) {
  const codeText = statusCode ? ` Status code: ${statusCode}` : "";
  const typeText = type ? ` Error occured in SCORM API call: ${type}` : "";
  const errorMsg = `${chalk.red("ERROR!")} ${msg}${codeText}${typeText}`;
  log(errorMsg);
  exit(1);
}

function log(msg) {
  LOG_STREAM.write(stripAnsi(`${Date.now()}\t${msg}\n`));
  if (debug.enabled) {
    debug(msg);
  } else {
    console.log(msg);
  }
}

function exit(status) {
  console.log(`Press anything to exit.`);
  process.stdin.setRawMode(true);
  process.stdin.once("data", () => {
    process.exit(status);
  });
}

// SCORM functions promisified
function upload(id = "", opts = { mayCreateNewVersion: false, file: false }) {
  return new Promise((resolve, reject) => {
    courseApi.createUploadAndImportCourseJob(id, opts, (err, data, res) => {
      // 400 bad request
      // 409 conflict, courseId exists and mayCreateNewVersion is false
      if (err)
        return reject({ err, res, type: "createUploadAndImportCourseJob" });
      resolve({
        data,
        res
      });
    });
  });
}

function checkJobStatus(jobId) {
  return new Promise((resolve, reject) => {
    courseApi.getImportJobStatus(jobId, (err, data, res) => {
      // 400	Bad request	MessageSchema    message prop
      // 404	importJobId not found
      if (err) return reject({ err, res, type: "getImportJobStatus" });
      resolve({
        data,
        res
      });
    });
  });
}

function getInvitation(courseId) {
  return new Promise((resolve, reject) => {
    invitationsApi.createPublicInvitation(
      { courseId, creatingUserEmail: SCORM_INVITATION_MAIL },
      (err, data, res) => {
        // 400	Bad request
        if (err) return reject({ err, res, type: "createPublicInvitation" });
        resolve({ data, res });
      }
    );
  });
}
