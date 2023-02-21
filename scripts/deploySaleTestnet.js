const { ethers } = require('hardhat');
//BLX contract address
//const BLX =

//OB addresses
//const DAO_ADDRESS = 
//const DAO = 

const l1usdcAddresses = {
    9413: "0xDc69A6f42F6F32Ff0dB3655460450E4357CeA099",
    5: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
};

const l1BlxAddresses = {
    9413: "0x5a891B33eE0651f5b6dA4F338c0900E514137e72",
    5: "0x0502F0fd4Be7854b5749328f7e3DD013B94e858E",
};

const biconomyForwarders = {
    9413: "0xD1B53d3c2E947d3C64A061c9256b065Fa0C19df2",
    5: "0xE041608922d06a4F26C0d4c27d8bCD01daf1f792",
};

const daoAgents = {
    9413: "0xD1B53d3c2E947d3C64A061c9256b065Fa0C19df2",
    5: "0xE041608922d06a4F26C0d4c27d8bCD01daf1f792",
};

const daos = {
    9413: "0xD1B53d3c2E947d3C64A061c9256b065Fa0C19df2",
    5: "0xE041608922d06a4F26C0d4c27d8bCD01daf1f792",
};

const PRESALE_END = 60 * 60 * 24 * 14; //14 days
const ADD_TIME = 60 * 60 * 24 * 30; //30 days
const IBCO_END = 60 * 60 * 24 * 28; //28 days
const SOFT_CAP_PRESALE = 200000 * 1e6; //200,000 USDC
const HARD_CAP_PRESALE = 1000000 * 1e6; //1,000,000 USDC
const SOFT_CAP = 1000000 * 1e6; //1,000,000 USDC
const HARD_CAP = 10000000 * 1e6; //10,000,000 USDC
const MIN_AMOUNT_PRESALE = 100 * 1e6; //100 USDC
const MIN_AMOUNT_IBCO = 1 * 1e6; //1 USDC

async function main() {
    const [deployer] = await ethers.getSigners();
    const { chainId } = await ethers.provider.getNetwork();
    const daoAgent = daoAgents[chainId];
    const dao = daos[chainId];

    console.log("Deploying contracts with the account:", deployer.address);
    console.log(`deploying sales contracts to ${chainId}`);

    const TokenSale = await ethers.getContractFactory("TokenSale");
    const tokenSale = await TokenSale.deploy(biconomyForwarders[chainId], l1usdcAddresses[chainId]);
    receipt = await ibco.deployTransaction.wait();
    console.log('TokenSale address: ', tokenSale.address, receipt.gasUsed.toNumber());

    const BlxPresale = await ethers.getContractFactory("BlxPresale");
    const blxPresale = await BlxPresale.deploy(biconomyForwarders[chainId], l1usdcAddresses[chainId], l1BlxAddresses[chainId], tokenSale.address);
    let receipt = await blxPresale.deployTransaction.wait();
    console.log('Presale address: ', blxPresale.address, receipt.gasUsed.toNumber());

    const IBCO = await ethers.getContractFactory("TestBiconomyIBCO");
    const ibco = await IBCO.deploy(biconomyForwarders[chainId], l1usdcAddresses[chainId], l1BlxAddresses[chainId], tokenSale.address);
    receipt = await ibco.deployTransaction.wait();
    console.log('IBCO address: ', ibco.address, receipt.gasUsed.toNumber());

    const tx = await tokenSale.setAddresses(blxPresale.address, ibco.address);
    receipt = await tx.wait();
    console.log(receipt.gasUsed.toNumber());

    console.log(`configuring Presale ${blxPresale.address}`);
    (await blxPresale.config(daoAgent, ibco.address, PRESALE_END, ADD_TIME, SOFT_CAP_PRESALE, HARD_CAP_PRESALE));
    (await blxPresale.setMinAmount(MIN_AMOUNT_PRESALE));

    console.log(`configuring IBCO ${ibco.address}`);
    (await (await ibco.config(blxPresale.address, daoAgent, dao, IBCO_END, SOFT_CAP, HARD_CAP)));
    (await ibco.setMinAmount(MIN_AMOUNT_IBCO));

    const TokenVesting = await ethers.getContractFactory("TokenVesting");
    const tokenVesting = await TokenVesting.deploy(l1BlxAddresses[chainId]);
    receipt = await tokenVesting.deployTransaction.wait();
    console.log('TokenVesting address: ', tokenVesting.address, receipt.gasUsed.toNumber());

    const TokenVestingFactory = await ethers.getContractFactory("TokenVestingFactory");
    const tokenVestingFactory = await TokenVestingFactory.deploy(tokenVesting.address);
    receipt = await tokenVestingFactory.deployTransaction.wait();
    console.log('TokenVestingFactory address: ', tokenVestingFactory.address, receipt.gasUsed.toNumber());

    const vestingWallets = await Promise.all(vestingConfig[chainId].map(async ({ walletAddress, amount }) => {
        const tx = await TokenVestingFactory.createLockBox(BlxToken.address, constants.AddressZero);
        console.log(`creating lockBox for ${walletAddress} ${tx.hash} `);
        const txResult = await tx.wait();
        console.log(`gas used ${txResult.gasUsed.toNumber()}`);
        // for private testing lock one day
        const startTime = chainId == 9413 ? (Math.round(Date.now() / 1000) + 60 * 60 * 24) : Date.parse("2024-12-31T00:00:00Z");
        const cliff = 0;
        const releaseDuration = 1; //1s all released immediately when unlocked
        const secondsPerSlice = 1; //portion size if duration > 1, basically % releasable during 'duration'
        //const amount = 12500000* 1000000;
        let lockBoxAddress;
        for (const event of txResult.events) {
            const { event: evt, args } = event;
            if (evt && evt.toString()) {
                const { owner, lockBox } = args;
                lockBoxAddress = lockBox.toString();
                console.log(`Event ${evt} with args ${owner} ${lockBoxAddress}`);
                const vestingContract = TokenVesting.attach(lockBoxAddress.toString());
                if (walletAddress) {
                    await vestingContract.createVestingSchedule(walletAddress, startTime, cliff, releaseDuration, secondsPerSlice, false, amount);
                    if (chainId == 9413) {
                        await BlxToken.transfer(lockBoxAddress, BigNumber.from(amount));
                    }
                    await vestingContract.transferOwnership(walletAddress);
                }
            }
        }
        return await connectContract(deployer, getContractFactory, "TokenVesting", lockBoxAddress);
    }));

}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
