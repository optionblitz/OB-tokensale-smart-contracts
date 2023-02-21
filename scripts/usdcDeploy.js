const { ethers } = require('hardhat');

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  const usdcHolderAddress = deployer.address;

  const USDC = await ethers.getContractFactory("FiatTokenV2_1");
  const usdc = await USDC.deploy();
  // must initialize new deployment of USDC simulation contract
  const txResult = await (await usdc.functions.initialize("USDC", "USDC", "USDC", 6, deployer.address, deployer.address, deployer.address, deployer.address, {
  })).wait();

  await (await usdc.functions.initializeV2("USDC", {
  })).wait();

  await (await usdc.functions.initializeV2_1(deployer.address, {
  })).wait();

  await (await usdc.functions.configureMinter(deployer.address, ethers.BigNumber.from("1000" + "000000" + "000000" +"000000"), {
  })).wait();

  await (await usdc.functions.mint(usdcHolderAddress, ethers.BigNumber.from("1000" + "000000" + "000000" +"000000"), {
  })).wait();

  console.log('USDC address: ', usdc.address);
  console.log(txResult);
  console.log((await usdc.functions.balanceOf(usdcHolderAddress)).toString());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

