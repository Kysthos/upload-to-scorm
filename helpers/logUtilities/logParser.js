const {
  Writable
} = require("stream");
const bytes = require("bytes");
const path = require("path").win32;

class Log extends Writable {
  constructor(logPath, opts = {}) {
    super(opts);
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
      uploadTime: undefined,
      scormProcessingTime: undefined,
      uploadStart: undefined,
      scormProcessingStart: undefined,
      scormProcessingEnd: undefined
    };

    // get user name and start date from the file name
    logPath = path.basename(logPath);
    logPath = logPath.replace(/\.log/i, "");
    const splitOn = logPath.lastIndexOf("_");
    this.data.user = logPath.substring(0, splitOn).replace(/^\./, '');
    this.data.start = Number(logPath.substring(splitOn + 1));

    // a helper variable
    this.lastLine = {
      date: 0,
      text: ''
    };
  }

  getRegex() {
    return {
      "courseId": /Generated new id for the course: (.+)/,
      "zipPath": /Uploading (.+?)\. This might take a while/,
      "jobId": /Job id assigned: (.+?)\. Uploading\./,
      "zipSize": /Zip size: (.+?)\.$/i,
      "courseName": /Course "(.+?)" uploaded successfully!/,
      "invitationLink": /Invitation link generated: (.+?)\.$/,
      "invitationPath": /Link saved to (.+)$/,
      "error": /ERROR(.+?)$/i,
    }
  }

  getRegexForOlderLogs() {
    return {
      "zipPath": /Starting upload (.+?) to SCORM Cloud/,
    }
  }

  _write(chunk, encoding, callback) {
    this.parseLine(chunk.toString());
    callback();
  }

  _final(callback) {
    // get the last log line date
    this.data.end = Math.max(
      ...this.lines.map(line => line.date).filter(date => !Number.isNaN(date))
    );
    // get zip file info
    if (this.data.zipPath) this.data.zipName = path.basename(this.data.zipPath);
    if (this.data.zipSize) this.data.zipSize = bytes.parse(this.data.zipSize);
    // if we got invitation path, it means the process finished successfully
    if (this.data.invitationPath) this.data.finished = true;
    // set duration times
    // total duration of the process
    this.data.duration = this.data.end - this.data.start;
    // uploading file to scorm
    if (this.data.uploadStart && this.data.scormProcessingStart)
      this.data.uploadTime = this.data.scormProcessingStart - this.data.uploadStart;
    // time scorm was processing the file
    if (this.data.scormProcessingStart && this.data.scormProcessingEnd)
      this.data.scormProcessingTime =
      this.data.scormProcessingEnd - this.data.scormProcessingStart;
    callback();
  }

  parseLine(line) {
    const logLine = {
      date: undefined,
      text: undefined
    };

    // get data and raw message
    const splitOn = line.indexOf("\t");
    logLine.date = Number(line.substring(0, splitOn));

    // if not a valid log line, concatenate to the message from the last log
    if (isNaN(logLine.date) || logLine.date === 0) return this.lastLine.text += line;

    logLine.text = line.substring(splitOn + 1).replace(/^.+?\tPUBLISH:.+?\t/, '');

    // check and set any properties if needed
    for (const [prop, regex] of Object.entries(this.getRegex()))
      this.checkAndSet(prop, logLine.text, regex);
    // some pathwork for older logs...
    for (const [prop, regex] of Object.entries(this.getRegexForOlderLogs()))
      this.checkAndSet(prop, logLine.text, regex);

    // upload time
    if (
      logLine.text.search("This might take a while") !== -1 ||
      logLine.text.search("Starting upload") !== -1
    )
      this.data.uploadStart = logLine.date;
    if (logLine.text.search("Job id assigned") !== -1)
      this.data.scormProcessingStart = logLine.date;
    if (logLine.text.search("uploaded successfully") !== -1)
      this.data.scormProcessingEnd = logLine.date;

    this.lines.push(logLine);
    this.lastLine = logLine;
  }

  checkAndSet(prop, str, regex) {
    const match = str.match(regex);
    if (match)
      this.data[prop] = match[1];
  }

  toJSON() {
    return {
      data: this.data,
      lines: this.lines
    };
  }
}

module.exports = Log;