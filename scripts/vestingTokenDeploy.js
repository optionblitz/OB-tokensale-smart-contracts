const hre = require('hardhat');
const { ethers } = hre;
const { BigNumber, constants } = require("ethers");

const vestingConfig = {
  9413: [
    {
      walletAddress: "0x0C5d63b41C93Fbd1c4630B99419e01144aE3ed06",
      amount: 12500000 * 1e6,
    },
    {
      walletAddress: "0xC005aefaBa615cED43d04a2b9950D226B3Ea4ee9",
      amount: 6250000 * 1e6,
    },
    {
      walletAddress: "0x4C55A78879D9C410B62Db37916e5627C6595C3Ac",
      amount: 6250000 * 1e6,
    },
  ],
  5: [
    {
      walletAddress: "0x0C5d63b41C93Fbd1c4630B99419e01144aE3ed06",
      amount: 12500000 * 1e6,
    },
    {
      walletAddress: "0xC005aefaBa615cED43d04a2b9950D226B3Ea4ee9",
      amount: 6250000 * 1e6,
    },
    {
      walletAddress: "0x4C55A78879D9C410B62Db37916e5627C6595C3Ac",
      amount: 6250000 * 1e6,
    },

  ],
  1: [
    {
      walletAddress: "0x0C5d63b41C93Fbd1c4630B99419e01144aE3ed06",
      amount: 12500000 * 1e6,
    },
    {
      walletAddress: "0xC005aefaBa615cED43d04a2b9950D226B3Ea4ee9",
      amount: 6250000 * 1e6,
    },
    {
      walletAddress: "0x4C55A78879D9C410B62Db37916e5627C6595C3Ac",
      amount: 6250000 * 1e6,
    },
  ],
}

const tokenVestingFactoryAddresses = {
  9413: "0xcDAAff704207c964aF8bc9F3e11AC33472374B0A",
  5: "0x1b4a039C1681aA2F9B22A0F487D8beBBc2B9099F",
}

const tokenVestingAddresses = {
  9413: "0xcDAAff704207c964aF8bc9F3e11AC33472374B0A",
  5: "0xfE29cBECBC3f8CE5707eC078Da8fD5ee7E6e12A3",
}

const l1blxTokenAddresses = {
  1: "0x0502F0fd4Be7854b5749328f7e3DD013B94e858E",
  5: "0x0502F0fd4Be7854b5749328f7e3DD013B94e858E",
  9413: "0x28fCde458ec2036c7816a1c9b567397c4f6b788f",
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = await deployer.getChainId();
  console.log(`chain ${chainId}`);
  console.log("Deploying contracts with the account:", deployer.address);
  const TokenVestingFactory = await (await ethers.getContractFactory("TokenVestingFactory")).attach(tokenVestingFactoryAddresses[chainId]);
  const TokenVesting = await ethers.getContractFactory("TokenVesting");
  const BlxToken = await (await ethers.getContractFactory("contracts/flattened/BlxToken.sol:BlxToken")).attach(l1blxTokenAddresses[chainId]);
  const lockBoxAddresses = {};
  for (let index = 0; index < vestingConfig[chainId].length; index++) {
    const { walletAddress, amount } = vestingConfig[chainId][index];
    const tx = await TokenVestingFactory.createLockBox(BlxToken.address, constants.AddressZero);
    console.log(`creating lockBox for ${walletAddress} ${tx.hash} `);
    const txResult = await tx.wait();
    console.log(`gas used ${txResult.gasUsed.toNumber()}`);
    // for private testing lock one day
    const skew = 60; // slightly more
    const lockTime = 0 + skew; // lock 500s more due to timestamp issue
    const startTime = chainId == 9413 ? (Math.round(Date.now() / 1000) + 60 * 60 * 24) : Math.round(Date.parse("2023-03-31T00:00:00Z")/1000) + lockTime;
    const sliceSeconds = chainId == 9413 ? 60 * 60 * 24 : (chainId === 5 ? 60 * 60 * 24 * 5 : 60 * 60 * 24 * 365); // testing duration 4 days, goerli 20 days, actual 4 years
    const lockedAmount = amount; 

    const cliff = 0;
    const releaseDuration = 4 * sliceSeconds; // 4 years schedule
    const secondsPerSlice = sliceSeconds; // 1/4 each year
    let lockBoxAddress;
    for (const event of txResult.events) {
      const { event: evt, args } = event;
      if (evt && evt.toString()) {
        const { owner, lockBox } = args;
        lockBoxAddress = lockBox.toString();
        console.log(`Event ${evt} with args ${owner} ${lockBoxAddress}`);
        const vestingContract = TokenVesting.attach(lockBoxAddress.toString());
        console.log(startTime, cliff, releaseDuration, secondsPerSlice, lockedAmount);
        if (walletAddress) {
          await vestingContract.createVestingSchedule(walletAddress, startTime, cliff, releaseDuration, secondsPerSlice, false, lockedAmount);
          // if (chainId == 9413) {
          //   await BlxToken.transfer(lockBoxAddress, BigNumber.from(lockedAmount));
          // }
          await vestingContract.transferOwnership(walletAddress);
        }
      }
    }
    lockBoxAddresses[walletAddress] = lockBoxAddress;
  }
  console.log(lockBoxAddresses);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

