const {ethers} = require("hardhat");

const USDC_DECIMALS = 6;

function increaseTime(time) {
  ethers.provider.send("evm_increaseTime", [ time ]);
  ethers.provider.send("evm_mine");
}

function alignBlockTimestamp(timestamp) {
  ethers.provider.send("evm_setNextBlockTimestamp", [timestamp])
}

// don't use it in time dependent tests, it is not compatible with block.timestamp
function currentTimestamp() {
    return Math.trunc(Date.now() / 1000);
}

async function latestBlockTimestamp() {
    const blockNumBefore = await ethers.provider.getBlockNumber();
    const blockBefore = await ethers.provider.getBlock(blockNumBefore);
    return blockBefore.timestamp;
}

function getRandomInt(max) {
  let result = 0;
  while (result == 0) {
      result = Math.floor(Math.random() * max)
  }
  return result;
}

function parseUsdc(value) {
  return ethers.utils.parseUnits(value, USDC_DECIMALS);
}

module.exports = {
  increaseTime,
  currentTimestamp,
  latestBlockTimestamp,
  getRandomInt,
  alignBlockTimestamp,
  parseUsdc
}
