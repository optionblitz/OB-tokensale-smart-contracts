const hre = require('hardhat');
const { ethers } = hre;

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  const mintTo = '0xc5Da6D61715240BC7f1981472Ed913F883B48959';

  const BlxToken = await ethers.getContractFactory("contracts/flattened/BlxToken.sol:BlxToken");
  
  blxToken = await BlxToken.deploy(mintTo);
  console.log('BLX address: ', blxToken.address);
  console.log(await blxToken.functions.balanceOf(mintTo));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

