const hre = require('hardhat');
const { ethers } = hre;

const lockDuration = 60 * 60 * 24 * 365;
const startTime = Math.round(Date.now()/1000) + lockedDuration;
const cliff = 0;
const releaseDuration = 1; //1s all released immediately when unlocked
const secondsPerSlice = 1; //portion size if duration > 1, basically % releasable during 'duration'
const beneficaries = [
  {
    beneficary: "",
    amount: 12500000 * 1000000,  
  }
];
const factoryAddresses = {

}

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);
  const factory = await ethers.getContractFactory("TokenVestingFactory");
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

