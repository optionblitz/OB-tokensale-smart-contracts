const { Signer } = require("@ethersproject/abstract-signer");
const { ContractTransaction, ContractFactory, Overrides } = require("@ethersproject/contracts");
const { Wallet } = require("@ethersproject/wallet");
const { BigNumber, constants } = require("ethers");

let silent = false;
const PERIOD_7_DAYS = 7 * 86400;
const ZERO_ADDRESS = '0x' + '0'.repeat(40);

const saleConfig = {
  9413: {
    PRESALE_START: Date.parse("2023-02-28T00:00:00Z"),
    PRESALE_END: 60 * 60 * 24 * 14, //14 days
    ADD_TIME: 60 * 60 * 24 * 30,//30 days
    IBCO_START: Date.parse("2023-03-31T00:00:00Z"),
    IBCO_END: 60 * 60 * 24 * 28,//28 days
    SOFT_CAP_PRESALE: 2000 * 1e6,// 2,000 USDC
    HARD_CAP_PRESALE: 10000 * 1e6, //10,000 USDC
    SOFT_CAP: 10000 * 1e6, //10,000 USDC
    HARD_CAP: 100000 * 1e6, //100,000 USDC
    MIN_AMOUNT_PRESALE: 100 * 1e6, //100 USDC
    MIN_AMOUNT_IBCO: 100 * 1e6, //1 USDC
    operator: "0x4C55A78879D9C410B62Db37916e5627C6595C3Ac", // for starting sale
    dao: "0x4C55A78879D9C410B62Db37916e5627C6595C3Ac", // what for ?
    daoAgent: "0x4C55A78879D9C410B62Db37916e5627C6595C3Ac", // received the tokens of USDC/BLX

  },
  5: {
    PRESALE_START: Date.parse("2023-02-28T00:00:00Z"),
    PRESALE_END: 60 * 60 * 24 * 14, //14 days
    ADD_TIME: 60 * 60 * 24 * 30,//30 days
    IBCO_START: Date.parse("2023-07-31T00:00:00Z"),
    IBCO_END: 60 * 60 * 24 * 28,//28 days
    SOFT_CAP_PRESALE: 200000 * 1e6,//200,000 USDC
    HARD_CAP_PRESALE: 1000000 * 1e6, //1,000,000 USDC
    SOFT_CAP: 1000000 * 1e6, //1,000,000 USDC
    HARD_CAP: 10000000 * 1e6, //10,000,000 USDC
    MIN_AMOUNT_PRESALE: 1000 * 1e6, //1000 USDC
    MIN_AMOUNT_IBCO: 1000 * 1e6, //1000 USDC
    operator: "0x1dF5730cD1Bf6964533C0876ae0927E0F72bF97D", // for starting sale
    dao: "0x1dF5730cD1Bf6964533C0876ae0927E0F72bF97D", // what for ?
    daoAgent: "0x1dF5730cD1Bf6964533C0876ae0927E0F72bF97D", // received the tokens of USDC/BLX
  },
  1: {
    PRESALE_START: Date.parse("2023-02-28T00:00:00Z"),
    PRESALE_END: 60 * 60 * 24 * 14, //14 days
    ADD_TIME: 60 * 60 * 24 * 30,//30 days
    IBCO_START: Date.parse("2023-03-31T00:00:00Z"),
    IBCO_END: 60 * 60 * 24 * 28,//28 days
    SOFT_CAP_PRESALE: 200000 * 1e6,//200,000 USDC
    HARD_CAP_PRESALE: 1000000 * 1e6, //1,000,000 USDC
    SOFT_CAP: 1000000 * 1e6, //1,000,000 USDC
    HARD_CAP: 10000000 * 1e6, //10,000,000 USDC
    MIN_AMOUNT_PRESALE: 1000 * 1e6, //1000 USDC
    MIN_AMOUNT_IBCO: 1000 * 1e6, //1000 USDC
    operator: "0x4C55A78879D9C410B62Db37916e5627C6595C3Ac", // for starting sale
    dao: "0x4C55A78879D9C410B62Db37916e5627C6595C3Ac", // what for ?
    daoAgent: "0x4C55A78879D9C410B62Db37916e5627C6595C3Ac", // received the tokens of USDC/BLX
  }
}

const vestingConfig = {
  9413: [
    {
    walletAddress: "0x4C55A78879D9C410B62Db37916e5627C6595C3Ac",
    amount: 12500000 * 1e6,
  }],
  5:[],
  1:[],
}

const tokenVestingFactoryAddresses = {
  9413: "0xcDAAff704207c964aF8bc9F3e11AC33472374B0A",
  5: "0x1b4a039C1681aA2F9B22A0F487D8beBBc2B9099F",
}

const tokenVestingAddresses = {
//  9413: "0xcDAAff704207c964aF8bc9F3e11AC33472374B0A",
  5: "0xfE29cBECBC3f8CE5707eC078Da8fD5ee7E6e12A3",
}

// initial owner of BLX, l1
const BlxOwner = {
  1: constants.AddressZero,
  9413: constants.AddressZero,
}

// arbitrum L1 router
const l1RouterAddresses = {
  9413: "0x41892Ca1a3F4642FF4224130a22FE689272dA6C7",
}

// arbitrum L2 router
const l2RouterAddresses = {
  //  9413: "0xDc69A6f42F6F32Ff0dB3655460450E4357CeA099",
}

// address on L2
const usdcAddresses = {
  9413: "0xDc69A6f42F6F32Ff0dB3655460450E4357CeA099",
}

// address on L1
const l1usdcAddresses = {
  1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  //5: "0x07865c6E87B9F70255377e024ace6630C1Eaa37F", // circle
  5: '0x66578bD1980616F83992F1edaB97FA21433d39Ac', // minter controled by us
  9413: "0x8B3CA29C10a33700A87fe935315DEB2b60f33DC3",
}

const l1BurnerAddress = {
  9413: "0xBAB61fee3CebD8156B9aA4c3700f0c00a5257098",
}

const l2BurnerAddress = {
  //  9413: "0xDc69A6f42F6F32Ff0dB3655460450E4357CeA099",
}

const treasuryAddresses = {
  //  9413: "0xA54A25FF159E0d7aA2937f7CdE393880f6586481",
}

const stakingAddresses = {
  //  9413: "0xDd88b25C651fD439c1E6a871F3E85954F98D64bB",
}

const affiliateAddresses = {
  //  9413: "0xead828ED6Eec9d453021D4aC7D19A356ef6f14F5",
}

// address on L1
const l1blxTokenAddresses = {
  1: "0x0502F0fd4Be7854b5749328f7e3DD013B94e858E",
  5: "0x0502F0fd4Be7854b5749328f7e3DD013B94e858E",
//  9413: "0xa2FEf2361d6a3580F282ca4E9eeF3BbbB25B061c",
}

// gasless transaction forwarder(biconomy)
const forwarderAddresses = {
  1: "0x84a0856b038eaAd1cC7E297cF34A7e72685A8693",
  5: "0xE041608922d06a4F26C0d4c27d8bCD01daf1f792", // this is from query and website
  9413: "0x8474c0A047ad6a336df1D8c4234e06Cd324D9246",
};

const multicallAddresses = {
  1: "0xeefba1e63905ef1d7acba5a8513c70307c1ce441",
  3: "0x53c43764255c17bd724f74c4ef150724ac50a3ed",
  4: "0x42ad527de7d4e9d9d011ac45b31d8551f8fe9821",
  5: "0x77dca2c955b15e9de4dbbcf1246b4b85b651e50e",
  42: "0x2cc8688c5f75e365aaeeb4ea8d6a480405a48d2a",
  9413: "0xf17968c6f83E800446d1e90703feDA7191745DEa",
};

const multicall2Addresses = {
  1: "0x5ba1e12693dc8f9c48aad8770482f4739beed696",
  3: "0x5ba1e12693dc8f9c48aad8770482f4739beed696",
  4: "0x5ba1e12693dc8f9c48aad8770482f4739beed696",
  5: "0x5ba1e12693dc8f9c48aad8770482f4739beed696",
  42: "0x5ba1e12693dc8f9c48aad8770482f4739beed696",
  9413: "0xDb96763408fDB533Ab02a615C508B15e326255fA",
};

const log = (...args) => {
  if (!silent) {
    console.log(...args);
  }
};

const setSilent = (s) => {
  silent = s;
};

const deployContractAndGetBlockNumber = async (
  deployer,
  getContractFactory,
  contractName,
  ...args
) => {
  log(`deployer address ${deployer.address}`);
  log(`Deploying ${contractName} ...`);
  let contract;
  contract = await (await getContractFactory(contractName, deployer)).deploy(...args);

  log(`Waiting for transaction ${contract.deployTransaction.hash} ...`);
  const receipt = await contract.deployTransaction.wait();

  log({
    contractAddress: contract.address,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toNumber()
  });

  log();
  contract.blockNumber = receipt.blockNumber;
  contract.gasUsed = receipt.gasUsed.toNumber();
  return [contract, receipt.blockNumber];
};

const connectContract = async (deployer, getContractFactory, contractName, address) => {
  log(`Connecting to contract ${contractName} at ${address}`);
  const factory = await getContractFactory(contractName, deployer);
  return { ...factory.attach(address), gasUsed: 0 };
};

const deployContract = (
  ...p
) => deployContractAndGetBlockNumber(...p).then(([a]) => a);

const deployL1Contracts = async (
  deployer,
  chainId,
  getContractFactory,
  usdcAddress,
  blxAddress,
  blxPriceAddress,
  overrides
) => {
  // const GatewayRouter = l1RouterAddresses[chainId]
  //   ? await connectContract(deployer, getContractFactory, "L1GatewayRouter", l1RouterAddresses[chainId])
  //   : await deployContract(deployer, getContractFactory, "L1GatewayRouter", {
  //     ...overrides
  //   });
  const Forwarder = forwarderAddresses[chainId]
    ? await connectContract(deployer, getContractFactory, "BiconomyForwarder", forwarderAddresses[chainId])
    : await deployContract(deployer, getContractFactory, "BiconomyForwarder", {
      ...overrides
    });
  const Multicall = multicallAddresses[chainId]
    ? await connectContract(deployer, getContractFactory, "Multicall", multicallAddresses[chainId])
    : await deployContract(deployer, getContractFactory, "Multicall", {
      ...overrides
    });
  const Multicall2 = multicall2Addresses[chainId]
    ? await connectContract(deployer, getContractFactory, "Multicall2", multicall2Addresses[chainId])
    : await deployContract(deployer, getContractFactory, "Multicall2", {
      ...overrides
    });
  // const Multicall2771 = multicall2771Addresses[chainId]
  //   ? await connectContract(deployer, getContractFactory, "Multicall2771", multicall2771Addresses[chainId])
  //   : await deployContract(deployer, getContractFactory, "Multicall2771", Forwarder.address, {
  //     ...overrides
  //   });
  // const MulticallForwarder = multicallForwarderAddresses[chainId]
  //   ? await connectContract(deployer, getContractFactory, "MulticallForwarder", multicallForwarderAddresses[chainId])
  //   : await deployContract(deployer, getContractFactory, "MulticallForwarder", {
  //     ...overrides
  //   });

  // USDC is based on FiatTokenV2_1 (for EIP712 support)
  const USDC = usdcAddress || l1usdcAddresses[chainId]
    ? await connectContract(deployer, getContractFactory, "FiatTokenV2_1", usdcAddress || l1usdcAddresses[chainId])
    : await deployContract(deployer, getContractFactory, "FiatTokenV2_1", {
      ...overrides
    });

  if (!usdcAddress && !l1usdcAddresses[chainId]) {
    // must initialize new deployment of USDC simulation contract
    await (await USDC.initialize("USDC", "USDC", "USDC", 6, deployer.address, deployer.address, deployer.address, deployer.address, {
      ...overrides
    })).wait();

    await USDC.initializeV2("USDC", {
      ...overrides
    });

    await USDC.initializeV2_1(deployer.address, {
      ...overrides
    });

    const usdcHolderAddress = "0x4C55A78879D9C410B62Db37916e5627C6595C3Ac";
    await (await USDC.configureMinter(deployer.address, BigNumber.from("1000" + "000000" + "000000" +"000000"), {

    })).wait();

    await (await USDC.configureMinter(usdcHolderAddress, BigNumber.from("1000" + "000000" + "000000" +"000000"), {

    })).wait();
    await (await USDC.mint(usdcHolderAddress, BigNumber.from("1000" + "000000" + "000000" +"000000"), {
      ...overrides
    })).wait();
  }

  // const Uniswap3ListingMaker = await deployContract(deployer, getContractFactory, "Uniswap3ListingMaker",
  //   {
  //     ...overrides
  //   });
  // const L1Burner = l1BurnerAddress[chainId]
  //   ? await connectContract(deployer, getContractFactory, "L1Burner", l1BurnerAddress[chainId])
  //   : await deployContract(deployer, getContractFactory, "L1Burner", BlxToken.address, {
  //     ...overrides
  //   });

  const mintTo = BlxOwner[chainId];
  const BlxToken = blxAddress || l1blxTokenAddresses[chainId]
    ? await connectContract(deployer, getContractFactory, "contracts/flattened/BlxToken.sol:BlxToken", blxAddress || l1blxTokenAddresses[chainId])
    : await deployContract(deployer, getContractFactory, "contracts/flattened/BlxToken.sol:BlxToken", mintTo || constants.AddressZero, {
      ...overrides
    });

  // token sales related, should be on L1 only(separate script needed for real deployment)  
  const TokenSale = await deployContract(deployer, getContractFactory, "TokenSale", Forwarder.address, USDC.address, {
    ...overrides
  });

  const BlxPresale = await deployContract(deployer, getContractFactory, "BlxPresale", Forwarder.address, USDC.address, BlxToken.address, TokenSale.address, {
    ...overrides
  });

  const IBCO = await deployContract(deployer, getContractFactory, "IBCO", Forwarder.address, USDC.address, BlxToken.address, TokenSale.address, {
    ...overrides
  });

  const TokenVesting = tokenVestingAddresses[chainId]
    ? await connectContract(deployer, getContractFactory, "TokenVesting", tokenVestingAddresses[chainId])
    : await deployContract(deployer, getContractFactory, "TokenVesting", BlxToken.address, {
    ...overrides
  });

  const TokenVestingFactory = tokenVestingFactoryAddresses[chainId]
    ? await connectContract(deployer, getContractFactory, "TokenVestingFactory", tokenVestingFactoryAddresses[chainId])
    : await deployContract(deployer, getContractFactory, "TokenVestingFactory", TokenVesting.address, {
    ...overrides
  });

  const vestingWallets = await Promise.all(vestingConfig[chainId].map(async ({walletAddress, amount}) => {
    const tx = await TokenVestingFactory.createLockBox(BlxToken.address, constants.AddressZero);    
    console.log(`creating lockBox for ${walletAddress} ${tx.hash} `);
    const txResult = await tx.wait();
    console.log(`gas used ${txResult.gasUsed.toNumber()}`);
    // for private testing lock one day
    const skew = 60; // slightly more
    const lockTime = 0 + skew; // lock 500s more due to timestamp issue
    const startTime = chainId == 9413 ? (Math.round(Date.now()/1000) + 60*60*24) : Date.parse("2023-3-31T00:00:00Z") + lockTime;
    const sliceSeconds = chainId == 9413 ? 60*60*24 : (chainId === 5 ? 60 * 60 * 24 * 5 : 60 * 60 * 24 * 365); // testing duration 3 days, actual 3 years
    const lockedAmount = 12500000 * 1e6 * 3 / 4; // 3/4 locked for 3 years

    const cliff = 0;
    const releaseDuration = 3 * sliceSeconds; // 3 years schedule
    const secondsPerSlice = sliceSeconds; // 1/3 each year
    //const amount = 12500000* 1000000;
    let lockBoxAddress;
    for (const event of txResult.events) {
      const { event:evt, args } = event;
      if (evt && evt.toString()) {
        const { owner, lockBox } = args;
        lockBoxAddress = lockBox.toString();
        console.log(`Event ${evt} with args ${owner} ${lockBoxAddress}`);
        const vestingContract = TokenVesting.attach(lockBoxAddress.toString());
        if (walletAddress) {
          await vestingContract.createVestingSchedule(walletAddress, startTime, cliff, releaseDuration, secondsPerSlice, false, lockedAmount);
          if (chainId == 9413) {
            await BlxToken.transfer(lockBoxAddress, BigNumber.from(lockedAmount)); 
          }
          await vestingContract.transferOwnership(walletAddress);
        }
      }
    }
    return await connectContract(deployer, getContractFactory, "TokenVesting", lockBoxAddress);
  }));

  const VestingContracts = vestingWallets.reduce((a, w, i)=> ({...a, ["TokenVesting" + (i+1)]: w}),{});

  const {
    PRESALE_END,
    ADD_TIME,
    IBCO_END,
    SOFT_CAP_PRESALE,
    HARD_CAP_PRESALE,
    SOFT_CAP,
    HARD_CAP,
    MIN_AMOUNT_PRESALE,
    MIN_AMOUNT_IBCO,
    PRESALE_START,
    IBCO_START,
    operator,
    dao,
    daoAgent,
  } = saleConfig[chainId];
  const BLX_PRESALE = HARD_CAP_PRESALE * 10; // fixed price 0.1
  const BLX_IBCO = HARD_CAP * 3; // ~ 3x of hard cap(in USDC)
  const BLX_REWARDS = (BLX_PRESALE + BLX_IBCO) / 10; // 10% referral rewards
  const TX_FEE = 1 * 5 * 1e6; // 5 USDC for each tx
  console.log(`connect BlxPresale ${BlxPresale.address} and IBCO ${IBCO.address} to TokenSale ${TokenSale.address}`);
  await TokenSale.setAddresses(BlxPresale.address, IBCO.address);

  console.log(`adding ${deployer.address} to BlxPresale ${BlxPresale.address}`);
  await (await BlxPresale.addTrustedAddress(deployer.address)).wait();
  console.log(`adding ${deployer.address} to IBCO ${IBCO.address}`);
  await (await IBCO.addTrustedAddress(deployer.address)).wait();
  console.log(`adding ${operator} to BlxPresale ${BlxPresale.address}`);
  await (await BlxPresale.addTrustedAddress(operator)).wait();
  console.log(`adding ${operator} to IBCO ${IBCO.address}`);
  await (await IBCO.addTrustedAddress(operator)).wait();
  console.log(`configuring Presale ${BlxPresale.address}`);
  (await BlxPresale.config(daoAgent, IBCO.address, PRESALE_END, ADD_TIME, SOFT_CAP_PRESALE, HARD_CAP_PRESALE, PRESALE_START));
  (await BlxPresale.setMinAmount(MIN_AMOUNT_PRESALE));
  (await BlxPresale.setTxCost(TX_FEE));
  console.log(`configuring IBCO ${IBCO.address}`);
  (await (await IBCO.config(BlxPresale.address, daoAgent, dao, IBCO_END, SOFT_CAP, HARD_CAP, IBCO_START)));
  (await IBCO.setMinAmount(MIN_AMOUNT_IBCO));
  (await IBCO.setTxCost(TX_FEE));

  if (chainId == 9413) {  
    console.log(`setup presale blx pool ${BLX_REWARDS + BLX_PRESALE}`);
    await BlxToken.transfer(BlxPresale.address, BLX_PRESALE + BLX_REWARDS);
  
    console.log(`setup ibco blx pool  ${BLX_IBCO}`);
    await BlxToken.transfer(IBCO.address, BLX_IBCO);

    const operatorUSDC = await USDC.balanceOf(operator);
    if (!operatorUSDC.gt(0)) {
      console.log(`sending USDC to ${operator} - ${operatorUSDC.toNumber()}`)
      await USDC.transfer(operator, BigNumber.from("100000000000000")); // send 100M USDC to operator for testing
    }
  }

  // change owner to daoAgent(to create vesting schedule)
  // await TokenVesting.transferOwnership(daoAgent);

  // if (chainId == 9413) {
  //   const operatorUSDC = await USDC.balanceOf(operator);
  //   console.log(`lock Blx to vesting contract ${TokenVesting.address}`);
  //   await BlxToken.transfer(TokenVesting.address, BigNumber.from("50000000000000")); //50M
  // }

  return [
    {
      ...{
        USDC, BlxToken,
        Multicall, Multicall2, Forwarder, BlxPresale, IBCO, TokenSale, 
        TokenVesting, TokenVestingFactory,
        ...VestingContracts,
        // aux separate deploy
        // Uniswap3ListingMaker, L1Burner, GatewayRouter, 
        // Multicall2771, MulticallForwarder,         
      }
    },
  ];
};

const deployAndSetupContracts = async (
  deployer,
  getContractFactory,
  l1,
  usdcAddress,
  blxAddress,
  blxPriceAddress,
  overrides
) => {
  if (!deployer.provider) {
    throw new Error("Signer must have a provider.");
  }
  const chainId = await deployer.getChainId();

  log(`Deploying contracts... to ${chainId}`);
  log();

  const deployment = {
    chainId: chainId,
    deploymentDate: new Date().getTime(),
    ...(await (l1 ? deployL1Contracts : deployContracts)(deployer, chainId, getContractFactory, usdcAddress, blxAddress, blxPriceAddress, overrides).then(
      async ([contracts]) => ({
        startBlock: Object.keys(contracts).reduce((a, n, i) => (Math.min(a, contracts[n].blockNumber || Number.MAX_VALUE)), Number.MAX_VALUE),
        totalGasUsed: Object.keys(contracts).reduce((a, n, i) => (a + (contracts[n].gasUsed || Number.MIN_VALUE)), 0),
        addresses: {
          ...Object.keys(contracts).reduce((a, n, i) => ({ ...a, [n]: contracts[n].address }), {}),
        }
      })
    ))
  };

  return {
    ...deployment,
  };
};

module.exports = {
  deployAndSetupContracts
}
