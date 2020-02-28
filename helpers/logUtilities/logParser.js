const { Writable } = require("stream");
const bytes = require("bytes");
const moment = require("moment");
const path = require("path");

class Log extends Writable {
  constructor(logPath, opts = {}) {
    super(opts);
    this.raw = [];
    this.lines = [];
    this.data = {
      logPath,
      user: undefined,
      // process status
      error: false,
      finished: false,
      // module data
      courseId: undefined,
      jobId: undefined,
      courseName: undefined,
      zipName: undefined,
      zipPath: undefined,
      zipSize: undefined,
      invitationLink: undefined,
      invitationPath: undefined,
      // timings
      start: undefined,
      end: undefined,
      duration: undefined,
      totalUploadTime: undefined,
      scormProcessingTime: undefined,
      uploadStart: undefined,
      scormProcessingStart: undefined,
      uploadEnd: undefined
    };

    // get user name and start date from the file name
    logPath = path.basename(logPath);
    logPath = logPath.replace(/\.log/i, "");
    const splitOn = logPath.lastIndexOf("_");
    this.data.user = logPath.substring(0, splitOn);
    this.data.start = Number(logPath.substring(splitOn + 1));
  }

  _write(chunk, encoding, callback) {
    this.parseLine(chunk.toString());
    callback();
  }

  _writev(chunks, callback) {
    this.parseLine(chunk.toString());
    callback();
  }

  _final(callback) {
    this.length = this.raw.length;
    const last = Math.max(
      ...this.lines.map(line => line.date).filter(date => !Number.isNaN(date))
    );
    this.data.end = last;
    this.data.duration = this.data.end - this.data.start;
    if (this.data.zipPath) this.data.zipName = path.basename(this.data.zipPath);
    if (this.data.zipSize) this.data.zipSize = bytes.parse(this.data.zipSize);
    callback();
  }

  parseLine(line) {
    this.raw.push(line);
    const logLine = {
      date: undefined,
      text: undefined
    };
    const splitOn = line.indexOf("\t");
    logLine.date = Number(line.substring(0, splitOn));
    logLine.text = line.substring(splitOn + 1);
    // check and set any properties if needed
    this.checkAndSet(
      "courseId",
      logLine.text,
      /Generated new id for the course: (.+)/
    );
    this.checkAndSet(
      "zipPath",
      logLine.text,
      /Uploading (.+?)\. This might take a while/
    );
    this.checkAndSet("zipSize", logLine.text, /Zip size: (.+?)\.$/i);
    this.checkAndSet(
      "jobId",
      logLine.text,
      /Job id assigned: (.+?)\. Uploading\./
    );
    this.checkAndSet(
      "courseName",
      logLine.text,
      /Course "(.+?)" uploaded successfully!/
    );
    this.checkAndSet(
      "invitationLink",
      logLine.text,
      /Invitation link generated: (.+?)\.$/
    );
    this.checkAndSet(
      "invitationPath",
      logLine.text,
      /Link saved to (.+)$/,
      () => (this.data.finished = true)
    );

    // upload time

    if (logLine.text.search("This might take a while") !== -1)
      this.data.uploadStart = logLine.date;
    if (logLine.text.search("Job id assigned") !== -1)
      this.data.scormProcessingStart = logLine.date;
    if (logLine.text.search("uploaded successfully") !== -1)
      this.data.uploadEnd = logLine.date;

    if (this.data.uploadStart && this.data.uploadEnd)
      this.data.totalUploadTime = this.data.uploadEnd - this.data.uploadStart;
    if (this.data.scormProcessingStart && this.data.uploadEnd)
      this.data.scormProcessingTime =
        this.data.uploadEnd - this.data.scormProcessingStart;

    this.lines.push(logLine);

    // ADD ERROR !!!
  }

  checkAndSet(prop, str, regex, fn) {
    const match = str.match(regex);
    if (match) {
      this.data[prop] = match[1];
      if (fn) fn();
    }
  }
}

module.exports = Log;
