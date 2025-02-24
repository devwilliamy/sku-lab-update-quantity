const fs = require("fs/promises");
const path = require("path");

// const __filename = __filename || __filename;
// const __dirname = path.dirname(__filename);

class LoggingService {
  constructor() {
    // Get the directory name using ES modules
    // const __filename = __filename; // Available by default in CommonJS
    // const __dirname = path.dirname(__filename);
    // Get current timestamp in YYYYMMDD_HHmm format
    const now = new Date();
    const timestamp = now
      .toISOString()
      .replace(/[-T:.Z]/g, "")
      .slice(0, 15); // Format: YYYYMMDDHHmm
    const formattedTimestamp = `${timestamp.slice(0, 8)}_${timestamp.slice(
      8,
      12
    )}`; // Format: YYYYMMDD_HHmm

    // Create logs directory in project root
    this.logsDir = path.join(__dirname, "./logs");
    this.allLogsPath = path.join(this.logsDir, `all_${formattedTimestamp}.log`);
    this.errorLogsPath = path.join(
      this.logsDir,
      `errors_${formattedTimestamp}.log`
    );
    this.warnLogsPath = path.join(
      this.logsDir,
      `warns_${formattedTimestamp}.log`
    );

    // Ensure logs directory exists
    this.initializeLogFiles();
  }

  async initializeLogFiles() {
    try {
      await fs.mkdir(this.logsDir, { recursive: true });
    } catch (error) {
      console.error("Error creating logs directory:", error);
    }
  }

  formatLogMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const formattedData = data
      ? `\nData: ${JSON.stringify(data, null, 2)}`
      : "";
    return `[${timestamp}] ${level}: ${message}${formattedData}\n\n`;
  }

  async writeToFile(filePath, message) {
    try {
      await fs.appendFile(filePath, message, "utf8");
    } catch (error) {
      console.error(`Error writing to log file ${filePath}:`, error);
    }
  }

  async info(message, data = null) {
    const logMessage = this.formatLogMessage("INFO", message, data);
    await this.writeToFile(this.allLogsPath, logMessage);
  }

  async error(message, error = null, data = null) {
    const errorDetails = error
      ? `\nError: ${error.stack || error.message || error}`
      : "";
    const logMessage = this.formatLogMessage(
      "ERROR",
      `${message}${errorDetails}`,
      data
    );

    // Write to both logs
    await Promise.all([
      this.writeToFile(this.allLogsPath, logMessage),
      this.writeToFile(this.errorLogsPath, logMessage),
    ]);
  }

  async warn(message, data = null) {
    const logMessage = this.formatLogMessage("WARN", message, data);
    await Promise.all([
      this.writeToFile(this.allLogsPath, logMessage),
      this.writeToFile(this.warnLogsPath, logMessage),
    ]);
  }

  async success(message, data = null) {
    const logMessage = this.formatLogMessage("SUCCESS", message, data);
    await this.writeToFile(this.allLogsPath, logMessage);
  }
}

module.exports = LoggingService;
