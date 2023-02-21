//const {assert, expect} = require("chai");
//const {assert, expect} = require("chai");
const {ethers} = require("hardhat");
//const {BigN} = require("bn.js");
const {BigNumber} = require("@ethersproject/bignumber");

const PERIOD_7_DAYS = 7 * 86400;

// returns accounts
const deployTestArchitecture = async (destination) => {
  accounts = await ethers.getSigners();
  alice = accounts[0];
  const owner = alice;

  bob = accounts[1];
  eva = accounts[2];
  users = [ alice, bob, eva ];
  unames = [ 'alice', 'bob', 'eva' ];

//  for (var i = 0; i < users.length; i++) {
//    console.log('%s \t:  %s', unames[i], users[i].address);
//  }

  const Abdk = await ethers.getContractFactory("Abdk");
  destination.abdk = await Abdk.deploy();

  const MockAbdk = await ethers.getContractFactory("MockAbdk");
  destination.mockAbdk = await MockAbdk.deploy();

  //console.log("Abdk address: ", destination.abdk.address);
  const Formulas = await ethers.getContractFactory("Formulas");

  destination.formulas = await Formulas.deploy();

  const HistoryVolatility = await ethers.getContractFactory("HistoryVolatility");
  destination.historyVolatility = await HistoryVolatility.deploy();
  await destination.historyVolatility.allowOperator(owner.address);

  const USDC = await ethers.getContractFactory("USDC");
  destination.usdToken = await USDC.deploy("USDC", "USDC");

  const BlxToken = await ethers.getContractFactory("BlxToken");
  destination.blxToken = await BlxToken.deploy();

  const Oracle = await ethers.getContractFactory("SimpleOracle");
  destination.oracle = await Oracle.deploy(
    destination.usdToken.address,
    destination.blxToken.address
  );

  const Treasury = await ethers.getContractFactory("Treasury");
  destination.treasury = await Treasury.deploy(
      destination.usdToken.address,
      destination.blxToken.address
  );

  await destination.blxToken.addTrustedAddress(destination.treasury.address);

  const StakingContract = await ethers.getContractFactory("StakingContract");
  destination.stakingContract = await StakingContract.deploy(
    destination.usdToken.address,
    destination.blxToken.address
  );

  await destination.treasury.configure(
    destination.stakingContract.address,
    destination.formulas.address
  );

  await destination.stakingContract.configure(
    destination.oracle.address,
    destination.treasury.address,
    destination.formulas.address,
    PERIOD_7_DAYS
  );

  await destination.treasury.addTrustedAddress(
    destination.stakingContract.address
  );
  await destination.stakingContract.addTrustedAddress(
    destination.treasury.address
  );

  // await destination.usdToken.mint(
  //     destination.treasury.address,
  //     ethers.utils.parseEther("10000")
  // );

  const Affiliate = await ethers.getContractFactory("Affiliate");
  destination.affiliate = await Affiliate.deploy(
    destination.usdToken.address,
    destination.blxToken.address,
    destination.treasury.address,
  );

  const DoubleTouch = await ethers.getContractFactory("DoubleTouch");
  destination.doubleTouch = await DoubleTouch.deploy(
      destination.treasury.address,
      destination.formulas.address,
      destination.usdToken.address,
      destination.historyVolatility.address,
      destination.affiliate.address
      );

  const DoubleNoTouch = await ethers.getContractFactory("DoubleNoTouch");
  destination.doubleNoTouch = await DoubleNoTouch.deploy(
      destination.treasury.address,
      destination.formulas.address,
      destination.usdToken.address,
      destination.historyVolatility.address,
      destination.affiliate.address
      );

  const OptionNoTouch = await ethers.getContractFactory("OptionNoTouch");
  destination.optionNoTouch = await OptionNoTouch.deploy(
      destination.treasury.address,
      destination.formulas.address,
      destination.usdToken.address,
      destination.historyVolatility.address,
      destination.affiliate.address
      );

  const OptionTouch = await ethers.getContractFactory("OptionTouch");
  destination.optionTouch = await OptionTouch.deploy(
      destination.treasury.address,
      destination.formulas.address,
      destination.usdToken.address,
      destination.historyVolatility.address,
      destination.affiliate.address
      );

  const OptionBinary = await ethers.getContractFactory("OptionBinary");
  destination.optionBinary = await OptionBinary.deploy(
      destination.treasury.address,
      destination.formulas.address,
      destination.usdToken.address,
      destination.historyVolatility.address,
      destination.affiliate.address
      );

  const OptionAmerican = await ethers.getContractFactory("OptionAmerican");
  destination.optionAmerican = await OptionAmerican.deploy(
      destination.treasury.address,
      destination.formulas.address,
      destination.usdToken.address,
      destination.blxToken.address,
      destination.historyVolatility.address,
      destination.affiliate.address,
      destination.oracle.address
      );

  const Turbo = await ethers.getContractFactory("Turbo");
  destination.turbo = await Turbo.deploy(
      destination.treasury.address,
      destination.formulas.address,
      destination.usdToken.address,
      destination.blxToken.address,
      destination.historyVolatility.address,
      destination.affiliate.address,
      destination.oracle.address
      );


  await destination.affiliate.addTrustedAddress(destination.optionBinary.address);
  await destination.affiliate.addTrustedAddress(destination.optionTouch.address);
  await destination.affiliate.addTrustedAddress(destination.optionNoTouch.address);
  await destination.affiliate.addTrustedAddress(destination.doubleTouch.address);
  await destination.affiliate.addTrustedAddress(destination.doubleNoTouch.address);
  await destination.affiliate.addTrustedAddress(destination.optionAmerican.address);
  await destination.affiliate.addTrustedAddress(destination.turbo.address);

  await destination.treasury.addTrustedAddress(destination.affiliate.address);

  return users;
};

module.exports = { deployTestArchitecture }
