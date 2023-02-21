const hre = require('hardhat');
require("@nomiclabs/hardhat-etherscan");
const fs = require("fs");
const path = require("path");
const { ethers, network } = hre;

async function main() {
  const { name } = network;
  const channel = 'default';
  const l1 = true;
  const noCompile = true;
//  const deployment = JSON.parse(fs.readFileSync(
//    path.join("deployments", channel, `${name}${l1 ? "L1" : ""}.json`),{ encoding: 'utf8'}
//  ));
  const deployment = require(path.join("../deployments", channel, `${name}${l1 ? "L1" : ""}.json`));
  //const deployment = deployments[name];
  const { BlxToken, TokenVesting, TokenVestingFactory  } = deployment.addresses;
  await hre.run("verify:verify", {
    address: TokenVesting,
    contract: "contracts/TokenVesting.sol:TokenVesting",
    constructorArguments: [
      BlxToken,
    ],
    noCompile
  });
  await hre.run("verify:verify", {
    address: TokenVestingFactory,
    contract: "contracts/TokenVestingFactory.sol:TokenVestingFactory",
    constructorArguments: [
      TokenVesting,
    ],
    noCompile
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

