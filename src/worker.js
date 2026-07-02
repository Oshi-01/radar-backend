require("dotenv").config();
const { startWorkers } = require("./workers");

console.log("Starting Radar Background Workers process...");
startWorkers();
