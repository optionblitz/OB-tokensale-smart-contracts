const hre = require('hardhat');
const { ethers } = hre;
const { BigNumber, constants } = require("ethers");

const USDC_DECIMALS = 6;

const toUsdc = (value) => {
  return ethers.utils.formatUnits(value, USDC_DECIMALS);
}

const toGWei = (value) => {
  return ethers.utils.formatUnits(value, 9);
}

const toEth = ethers.utils.formatEther;

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
      walletAddress: "0xBc6Fc8C26d4AB5DD1b9DB1651F394303446e04A0",
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
      walletAddress: "0xBc6Fc8C26d4AB5DD1b9DB1651F394303446e04A0",
      amount: 6250000 * 1e6,
    },

  ],
  1: [
    // {
    //   walletAddress: "0x0C5d63b41C93Fbd1c4630B99419e01144aE3ed06",
    //   amount: 12500000 * 1e6,
    // },
    // {
    //   walletAddress: "0xC005aefaBa615cED43d04a2b9950D226B3Ea4ee9",
    //   amount: 6250000 * 1e6,
    // },
    // {
    //   walletAddress: "0xBc6Fc8C26d4AB5DD1b9DB1651F394303446e04A0",
    //   amount: 6250000 * 1e6,
    // },
  ],
}

const tokenVestingFactoryAddresses = {
  9413: "0x84380846F4CB8D91C0A3D433BddcC27A629C3E71",
  5: "0x84396Ac0eD0a735521E7248354bbB07C403b73F9",
  1: "0xfE7eA486693374A817ca6F44791F42209F9Fb3b3",
}

const tokenVestingAddresses = {
  9413: "0x11cce1e32C8c3015c533d8133c80414b19874e0f",
  5: "0xed71b056dC020da8a42253009494dcc10C391824",
  1: "0x12b207557930D0e460E42ac961dAC85A7ba49e46",
}

const l1blxTokenAddresses = {
  1: "0x0502F0fd4Be7854b5749328f7e3DD013B94e858E",
  5: "0x0502F0fd4Be7854b5749328f7e3DD013B94e858E",
  9413: "0x28fCde458ec2036c7816a1c9b567397c4f6b788f",
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = await deployer.getChainId();
  const provider = deployer.provider;
  const maxPrice = 40 * 1e9;
  const gasRequired = 116219 + 259899 + 31260;
  const totalGasRequired = gasRequired * vestingConfig[chainId].length;
  const gasPrice = await provider.getGasPrice();
  const ethBalance = await provider.getBalance(deployer.address);
  const ethNeeded = gasPrice.mul(totalGasRequired);
  console.log(`chain ${chainId}`);
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Gas Price: ", toGWei(gasPrice), toGWei(maxPrice));
  console.log("Gas Needed: ", gasRequired);
  console.log(`Total Gas Needed: ${toUsdc(totalGasRequired)}M for ${vestingConfig[chainId].length} lockbox`);
  console.log(`Eth Needed: ${toEth(ethNeeded)} @ ${toGWei(gasPrice)}`);
  console.log(`Max Eth Allowed: ${toEth(BigNumber.from(maxPrice).mul(totalGasRequired))} @ ${toGWei(maxPrice)}`);
  console.log(`Eth Balance: ${toEth(ethBalance)}`);
  if (gasPrice.gt(maxPrice)) {
    console.log('Gas Price too high');
    return;
  }
  if (ethNeeded.gt(ethBalance)) {
    console.log('Not enough ETH');
    return;
  }
  let TokenVestingFactory = await ethers.getContractFactory("TokenVestingFactory");
  let TokenVesting = await ethers.getContractFactory("TokenVesting");
  const BlxToken = await (await ethers.getContractFactory("contracts/flattened/BlxToken.sol:BlxToken")).attach(l1blxTokenAddresses[chainId]);
  const lockBoxAddresses = {};
  if (!(tokenVestingAddresses[chainId])) {
    const contract = await TokenVesting.deploy(BlxToken.address);
    await contract.deployTransaction.wait();
    console.log(`new TokenVesting contract address: ${contract.address}`);
    TokenVesting = contract;
  }
  else {
    TokenVesting = TokenVesting.attach(tokenVestingAddresses[chainId]);
  }

  if (!(tokenVestingFactoryAddresses[chainId])) {
    const contract = await TokenVestingFactory.deploy(TokenVesting.address);
    await contract.deployTransaction.wait();
    console.log(`new TokenVestingFactory contract address: ${contract.address}`);
    TokenVestingFactory = contract;
  }
  else {
    TokenVestingFactory = TokenVestingFactory.attach((tokenVestingFactoryAddresses[chainId]));
  }

  for (let index = 0; index < vestingConfig[chainId].length; index++) {
    const { walletAddress, amount } = vestingConfig[chainId][index];
    const gasPrice = await provider.getGasPrice();
    console.log("Gas Price: ", toGWei(gasPrice), toGWei(maxPrice));
    if (gasPrice.gt(maxPrice)) {
      console.log('Gas Price too high');
      break;
    }  
    const tx = await TokenVestingFactory.createLockBox(BlxToken.address, constants.AddressZero);
    console.log(`creating lockBox for ${walletAddress} ${tx.hash} `);
    const txResult = await tx.wait();
    console.log(`gas used ${txResult.gasUsed.toNumber()} ${toGWei(txResult.effectiveGasPrice.toNumber())} ${toEth(txResult.effectiveGasPrice.mul(txResult.gasUsed))}`);
    // for private testing lock one day
    const skew = 0; // slightly more
    const lockTime = 0 + skew; // lock 500s more due to timestamp issue
    const startTime = chainId == 9413 ? (Math.round(Date.now() / 1000) + 60 * 60 * 24) : Math.round(Date.parse("2023-02-28T10:00:00Z")/1000) + lockTime;
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
        if (walletAddress) {
          console.log('setting up schedule');
          console.log(new Date(startTime *1000).toISOString(), cliff, releaseDuration, secondsPerSlice, toUsdc(lockedAmount));
          const tx = await vestingContract.createVestingSchedule(walletAddress, startTime, cliff, releaseDuration, secondsPerSlice, false, lockedAmount);
          // const txResult1 = await tx.wait();
          // console.log(`gas used ${txResult1.gasUsed.toNumber()} ${toGWei(txResult1.effectiveGasPrice.toNumber())} ${toEth(txResult1.effectiveGasPrice.mul(txResult1.gasUsed))}`);
          //console.log(`gas used ${(await tx.wait()).gasUsed.toNumber()}`);
          // if (chainId == 9413) {
          //   await BlxToken.transfer(lockBoxAddress, BigNumber.from(lockedAmount));
          // }
          console.log('transfer ownership to ', walletAddress);
          const tx1 = await vestingContract.transferOwnership(walletAddress);
          // const txResult2 = await tx1.wait();
          // console.log(`gas used ${txResult2.gasUsed.toNumber()} ${toGWei(txResult2.effectiveGasPrice.toNumber())} ${toEth(txResult2.effectiveGasPrice.mul(txResult2.gasUsed))}`);
          //console.log(`gas used ${(await tx1.wait()).gasUsed.toNumber()}`);
        }
      }
    }
    lockBoxAddresses[walletAddress] = lockBoxAddress;
  }
  const ethBalance1 = await provider.getBalance(deployer.address);
  console.log(`ETH used ${toEth(ethBalance.sub(ethBalance1))}`)
  console.log(lockBoxAddresses);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

