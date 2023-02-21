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
  const { BlxPresale, IBCO, TokenSale, USDC, Forwarder, BlxToken  } = deployment.addresses;
  await hre.run("verify:verify", {
    address: TokenSale,
    contract: "contracts/sale/TokenSale.sol:TokenSale",
    constructorArguments: [
      Forwarder,
      USDC,
    ],
    noCompile
  });
  await hre.run("verify:verify", {
    address: BlxPresale,
    contract: "contracts/sale/BlxPresale.sol:BlxPresale",
    constructorArguments: [
      Forwarder,
      USDC,
      BlxToken,
      TokenSale,
    ],
    noCompile,
  });
  await hre.run("verify:verify", {
    address: BlxPresale,
    contract: "contracts/sale/IBCO.sol:IBCO",
    constructorArguments: [
      Forwarder,
      USDC,
      BlxToken,
      TokenSale,
    ],
    noCompile,
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

