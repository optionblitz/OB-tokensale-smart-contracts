const { ethers } = require('hardhat');
//BLX contract address
//const BLX =

//OB addresses
//const DAO_ADDRESS = 
//const DAO = 

// address on L1
const l1usdcAddresses = {
  9413: "0xDc69A6f42F6F32Ff0dB3655460450E4357CeA099",
  5: "0x07865c6E87B9F70255377e024ace6630C1Eaa37F",
};

const l1BlxAddresses = {
  9413: "0x5a891B33eE0651f5b6dA4F338c0900E514137e72",
  5: "0x0502F0fd4Be7854b5749328f7e3DD013B94e858E",
};

const biconomyForwarders = {
  1: "0x84a0856b038eaAd1cC7E297cF34A7e72685A8693",
  9413: "0x37d293fEc67eF10b9f2EFC14836647605D76AC4B",
  5: "0xE041608922d06a4F26C0d4c27d8bCD01daf1f792",
};

const tokenSaleAddresses = {
  5: "0x258F19C8741F6e935cCB3Ef475Cd3d538F569E41",
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const { chainId } = await ethers.provider.getNetwork();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log(`deploying sales contracts to ${chainId}`);

  const BlxPresale = await ethers.getContractFactory("TestBiconomyPresale");
  const blxPresale = await BlxPresale.deploy();
  let receipt = await blxPresale.deployTransaction.wait();
  console.log('Presale address: ', blxPresale.address, receipt.gasUsed.toNumber());

  const IBCO = await ethers.getContractFactory("TestBiconomyIBCO");
  const ibco = await IBCO.deploy();
  receipt = await ibco.deployTransaction.wait();
  console.log('IBCO address: ', ibco.address, receipt.gasUsed.toNumber());

  const TokenSale = await ethers.getContractFactory("TokenSale");
  const tokenSale = await TokenSale.deploy(biconomyForwarders[chainId], l1usdcAddresses[chainId]);
  receipt = await ibco.deployTransaction.wait();
  console.log('TokenSale address: ', tokenSale.address, receipt.gasUsed.toNumber());

  const tx = await tokenSale.setAddresses(blxPresale.address, ibco.address);
  receipt = await tx.wait();
  console.log(receipt.gasUsed.toNumber());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
