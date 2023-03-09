const { expect } = require('chai');
const { ethers } = require('hardhat');

const {
    increaseTime,
    latestBlockTimestamp
} = require("./common/utils.js");

const AddressZero = "0x0000000000000000000000000000000000000000";
const PRESALE_END = 60 * 60 * 24 * 14; //14 days
const ADD_TIME = 60 * 60 * 24 * 30; //30 days
const MIN_AMOUNT_PRESALE = 100 * 1e6; // 100 USDC
const IBCO_END = 60 * 60 * 24 * 28; //28 days
const SOFT_CAP_PRESALE = 200000 * 1e6; //200,000 USDC
const HARD_CAP_PRESALE = 1000000 * 1e6; //1,000,000 USDC
const SOFT_CAP = 1000000 * 1e6; //1,000,000 USDC
const HARD_CAP = 10000000 * 1e6; //10,000,000 USDC
const MIN_AMOUNT = 1 * 1e6; //1 USDC

describe('Token Vesting', function () {
    let accounts, admin, kyc, usdToken, testDAO, tokenVesting, tokenVestingFactory, createLockBox;
    beforeEach(async () => {
        accounts = await ethers.getSigners();
        admin = accounts[0];

        const USDC = await ethers.getContractFactory("USDC");
        usdToken = await USDC.deploy("USDC", "USDC");

        const TestDAO = await ethers.getContractFactory("TestDAO");
        testDAO = await TestDAO.deploy(usdToken.address);

        const TokenVesting = await ethers.getContractFactory("TokenVesting");
        tokenVesting = await TokenVesting.deploy(usdToken.address);

        const TokenVestingFactory = await ethers.getContractFactory("TokenVestingFactory");
        tokenVestingFactory = await TokenVestingFactory.deploy(tokenVesting.address);

        // mint 100M
        await usdToken.mint(admin.address, 100000000 * 1e6);

        createLockBox = async (walletAddress, lockedFor, amount) => {
            const tx = await tokenVestingFactory.createLockBox(usdToken.address, AddressZero);
            //console.log(`creating lockBox for ${walletAddress} ${tx.hash} `);
            const txResult = await tx.wait();
            //console.log(`gas used ${txResult.gasUsed.toNumber()}`);
            // for private testing lock one day
            const secondsPerSlice = 60 * 60 * 24 * 365; //portion size if duration > 1, basically % releasable during 'duration'
            // start time is now but only start to release after secondsPerSlice
            const blockNumber = await ethers.provider.getBlockNumber();
            const block = await ethers.provider.getBlock();
            const timestamp = block.timestamp;
            const startTime = timestamp + lockedFor;
            const cliff = 0;
            const releaseDuration = 4 * secondsPerSlice; // release in 4 years
            //const amount = 12500000* 1000000;
            let lockBoxAddress;
            for (const event of txResult.events) {
                const { event: evt, args } = event;
                if (evt && evt.toString()) {
                    const { owner, lockBox } = args;
                    lockBoxAddress = lockBox.toString();
                    //console.log(`Event ${evt} with args ${owner} ${lockBoxAddress}`);
                    const vestingContract = TokenVesting.attach(lockBoxAddress.toString());
                    if (walletAddress) {
                        await (await vestingContract.createVestingSchedule(walletAddress, startTime, cliff, releaseDuration, secondsPerSlice, false, amount)).wait();
                        await usdToken.transfer(lockBoxAddress, ethers.BigNumber.from(amount));
                        await vestingContract.transferOwnership(walletAddress);
                    }
                }
            }
            return (await ethers.getContractFactory("TokenVesting")).attach(lockBoxAddress);
        }
    });

    describe("During release period period", async () => {
        const skew = 500;
        const lockTime = 0 + skew; // lock 500s more due to timestamp issue
        const sliceSeconds = 60 * 60 * 24 * 365;
        const lockedAmount = 12500000 * 1e6;

        it('cannot create more than one schedule', async function () {
            for (i = 1; i < 2; i++) {
                const lockBox = await createLockBox(accounts[i].address, lockTime, lockedAmount);
                await expect(lockBox.connect(accounts[i]).createVestingSchedule(accounts[i].address, Math.round(Date.now() / 1000), 0, 1, 1, false, lockedAmount))
                    .to.be.revertedWith("TokenVesting: only one schedule is allowed");
            }
        });

        it('Locked and not releasable (failed during first locked period)', async function () {
            let lockBoxes= [];
            for (i = 1; i < 5; i++) {
                const lockBox = await createLockBox(accounts[i].address, lockTime, lockedAmount);
                let balance = await usdToken.balanceOf(lockBox.address);
                console.log('Locked: ', balance / 1e6, 'USDC');
                expect(balance).to.be.equal(lockedAmount);
                const proposal = await testDAO.populateTransaction.vote(0, true);
                const data = await proposal.data;
                //console.log(proposal, data);
                await lockBox.connect(accounts[i]).execute(testDAO.address, data);
                lockBoxes.push(lockBox);
            }

            await increaseTime(sliceSeconds - 1);

            for (i = 1; i < 5; i++) {
                const lockBox = lockBoxes[i - 1];
                const vestingId = await lockBox.computeVestingScheduleIdForAddressAndIndex(accounts[i].address, 0);
                //console.log(vestingId);
                await expect(lockBox.connect(accounts[i]).release(vestingId, lockedAmount))
                    .to.be.revertedWith("TokenVesting: cannot release tokens, not enough vested tokens");
            }
        });

        it('Locked and vote, DAO action', async function () {
            let lockBoxes= [];
            for (i = 1; i < 5; i++) {
                const lockBox = await createLockBox(accounts[i].address, lockTime, lockedAmount);
                let balance = await usdToken.balanceOf(lockBox.address);
                console.log('Locked: ', balance / 1e6, 'USDC');
                const proposal = await testDAO.populateTransaction.vote(0, true);
                const data = await proposal.data;
                //console.log(proposal, data);
                await lockBox.connect(accounts[i]).execute(testDAO.address, data);
                lockBoxes.push(lockBox);
            }
        });

        it('Locked not revokable', async function () {
            let lockBoxes= [];
            for (i = 1; i < 5; i++) {
                const lockBox = await createLockBox(accounts[i].address, lockTime, lockedAmount);
                let balance = await usdToken.balanceOf(lockBox.address);
                console.log('Locked: ', balance / 1e6, 'USDC');
                const vestingId = await lockBox.computeVestingScheduleIdForAddressAndIndex(accounts[i].address, 0);
                const vesting = await lockBox.getVestingSchedule(vestingId);
                //console.log(vesting);
                //console.log(vestingId);
                await expect(lockBox.connect(accounts[i]).revoke(vestingId))
                    .to.be.revertedWith("TokenVesting: vesting is not revocable");
            }
        });

        it('Locked not withdrawable', async function () {
            let lockBoxes= [];
            for (i = 1; i < 5; i++) {
                const lockBox = await createLockBox(accounts[i].address, lockTime, lockedAmount);
                let balance = await usdToken.balanceOf(lockBox.address);
                console.log('Locked: ', balance / 1e6, 'USDC');
                let vested = await lockBox.getVestingSchedulesTotalAmount();
                console.log('Vested: ', vested / 1e6, 'USDC');
                const vesting = await lockBox.getLastVestingScheduleForHolder(accounts[i].address);
                //console.log(vesting);
                await expect(lockBox.connect(accounts[i]).withdraw(lockedAmount))
                    .to.be.revertedWith("TokenVesting: not enough withdrawable funds");
            }
        });

        it('Locked not transferable directly(fail against locked token)', async function () {
            let lockBoxes= [];
            for (i = 1; i < 5; i++) {
                const lockBox = await createLockBox(accounts[i].address, lockTime, lockedAmount);
                let balance = await usdToken.balanceOf(lockBox.address);
                console.log('Locked: ', balance / 1e6, 'USDC');
                lockBoxes.push(lockBox);
                const proposal = await usdToken.transfer(accounts[i].address, lockedAmount);
                const data = await proposal.data;
                //console.log(proposal, data);
                await expect(lockBox.connect(accounts[i]).execute(usdToken.address, data))
                    .to.be.revertedWith("TokenVesting: cannot act against locked token");
            }
        });

        it('Locked not transferable via approve directly(fail against locked token)', async function () {
            let lockBoxes= [];
            for (i = 1; i < 5; i++) {
                const lockBox = await createLockBox(accounts[i].address, lockTime, lockedAmount);
                let balance = await usdToken.balanceOf(lockBox.address);
                console.log('Locked: ', balance / 1e6, 'USDC');
                lockBoxes.push(lockBox);
                const proposal = await usdToken.approve(accounts[i].address, lockedAmount);
                const data = await proposal.data;
                //console.log(proposal, data);
                await expect(lockBox.connect(accounts[i]).execute(usdToken.address, data))
                    .to.be.revertedWith("TokenVesting: cannot act against locked token");
            }
        });
    })

    describe("After locked period", async () => {
        const skew = 60;
        //const lockTime = 60 * 60 * 24 * 365 + skew; // lock 60s more due to timestamp issue
        const lockTime = 0 + skew;
        const sliceSeconds = 60 * 60 * 24 * 365;
        const lockedAmount = 12500000 * 1e6;

        it('Locked and release after locked period, on anniversaries', async function () {
            let lockBoxes1 = [];
            for (i = 1; i < 5; i++) {
                const lockBox = await createLockBox(accounts[i].address, lockTime, lockedAmount);
                let balance = await usdToken.balanceOf(lockBox.address);
                console.log('Locked: ', balance / 1e6, 'USDC', lockBox.address);
                expect(balance).to.be.equal(lockedAmount);
                const proposal = await testDAO.populateTransaction.vote(0, true);
                const data = await proposal.data;
                //console.log(proposal, data);
                await lockBox.connect(accounts[i]).execute(testDAO.address, data);
                lockBoxes1.push(lockBox);
            }
            // year 1
            await increaseTime(sliceSeconds + skew);

            for (i = 1; i < 5; i++) {
                const lockBox = lockBoxes1[i - 1];
                const vestingId = await lockBox.computeVestingScheduleIdForAddressAndIndex(accounts[i].address, 0);
                //console.log(vestingId);
                const releasable = await lockBox.computeReleasableAmount(vestingId);
                let balance0 = await usdToken.balanceOf(accounts[i].address);
                console.log(lockBox.address, releasable.toNumber(), (await usdToken.balanceOf(lockBox.address)).toNumber());
                await lockBox.connect(accounts[i]).release(vestingId, releasable);
                let balance = await usdToken.balanceOf(lockBox.address);
                // 1/4
                expect(balance).to.be.equal(lockedAmount * 3 / 4);
                let balance1 = await usdToken.balanceOf(accounts[i].address);
                // to beneficiary
                expect(balance1 - balance0).to.be.equal(lockedAmount / 4);
            }
            // end of year 2
            await increaseTime(sliceSeconds);

            for (i = 1; i < 5; i++) {
                const lockBox = lockBoxes1[i - 1];
                const vestingId = await lockBox.computeVestingScheduleIdForAddressAndIndex(accounts[i].address, 0);
                //console.log(vestingId);
                const releasable = await lockBox.computeReleasableAmount(vestingId)
                let balance0 = await usdToken.balanceOf(accounts[i].address);
                await lockBox.connect(accounts[i]).release(vestingId, releasable);
                let balance = await usdToken.balanceOf(lockBox.address);
                // 1/4
                expect(balance).to.be.equal(lockedAmount * 2 / 4);
                let balance1 = await usdToken.balanceOf(accounts[i].address);
                // to beneficiary
                expect(balance1 - balance0).to.be.equal(lockedAmount / 4);
            }
            // end of year 3
            await increaseTime(sliceSeconds);

            for (i = 1; i < 5; i++) {
                const lockBox = lockBoxes1[i - 1];
                const vestingId = await lockBox.computeVestingScheduleIdForAddressAndIndex(accounts[i].address, 0);
                //console.log(vestingId);
                const releasable = await lockBox.computeReleasableAmount(vestingId)
                let balance0 = await usdToken.balanceOf(accounts[i].address);
                await lockBox.connect(accounts[i]).release(vestingId, releasable);
                let balance = await usdToken.balanceOf(lockBox.address);
                // another 1/4
                expect(balance).to.be.equal(lockedAmount * 1 / 4);
                let balance1 = await usdToken.balanceOf(accounts[i].address);
                // to beneficiary
                expect(balance1 - balance0).to.be.equal(lockedAmount / 4);
            }

            // end of year 4 
            await increaseTime(sliceSeconds);

            for (i = 1; i < 5; i++) {
                const lockBox = lockBoxes1[i - 1];
                const vestingId = await lockBox.computeVestingScheduleIdForAddressAndIndex(accounts[i].address, 0);
                //console.log(vestingId);
                const releasable = await lockBox.computeReleasableAmount(vestingId)
                let balance0 = await usdToken.balanceOf(accounts[i].address);
                await lockBox.connect(accounts[i]).release(vestingId, releasable);
                let balance = await usdToken.balanceOf(lockBox.address);
                // another 1/4
                expect(balance).to.be.equal(lockedAmount * 0 / 4);
                let balance1 = await usdToken.balanceOf(accounts[i].address);
                // to beneficiary
                expect(balance1 - balance0).to.be.equal(lockedAmount / 4);
            }
        });

        it('Locked and release after locked period, 1s before anniversaries', async function () {
            let lockBoxes1 = [];
            for (i = 1; i < 5; i++) {
                const lockBox = await createLockBox(accounts[i].address, lockTime, lockedAmount);
                let balance = await usdToken.balanceOf(lockBox.address);
                console.log('Locked: ', balance / 1e6, 'USDC', lockBox.address);
                expect(balance).to.be.equal(lockedAmount);
                const proposal = await testDAO.populateTransaction.vote(0, true);
                const data = await proposal.data;
                //console.log(proposal, data);
                await lockBox.connect(accounts[i]).execute(testDAO.address, data);
                lockBoxes1.push(lockBox);
            }
            // 1s before end of year 1
            await increaseTime(sliceSeconds);

            for (i = 1; i < 5; i++) {
                const lockBox = lockBoxes1[i - 1];
                const vestingId = await lockBox.computeVestingScheduleIdForAddressAndIndex(accounts[i].address, 0);
                //console.log(vestingId);
                const releasable = await lockBox.computeReleasableAmount(vestingId);
                let balance0 = await usdToken.balanceOf(accounts[i].address);
                console.log(lockBox.address, releasable.toNumber(), (await usdToken.balanceOf(lockBox.address)).toNumber());
                await lockBox.connect(accounts[i]).release(vestingId, releasable);
                let balance = await usdToken.balanceOf(lockBox.address);
                // nothing released
                expect(balance).to.be.equal(lockedAmount * 4 / 4);
                let balance1 = await usdToken.balanceOf(accounts[i].address);
                // to beneficiary
                expect(balance1 - balance0).to.be.equal(0);
            }
            // end of year 2 - 1s
            await increaseTime(sliceSeconds);

            for (i = 1; i < 5; i++) {
                const lockBox = lockBoxes1[i - 1];
                const vestingId = await lockBox.computeVestingScheduleIdForAddressAndIndex(accounts[i].address, 0);
                //console.log(vestingId);
                const releasable = await lockBox.computeReleasableAmount(vestingId)
                let balance0 = await usdToken.balanceOf(accounts[i].address);
                await lockBox.connect(accounts[i]).release(vestingId, releasable);
                let balance = await usdToken.balanceOf(lockBox.address);
                // 1/4
                expect(balance).to.be.equal(lockedAmount * 3 / 4);
                let balance1 = await usdToken.balanceOf(accounts[i].address);
                // to beneficiary
                expect(balance1 - balance0).to.be.equal(lockedAmount / 4);
            }
            // end of year 3 - 1s
            await increaseTime(sliceSeconds);

            for (i = 1; i < 5; i++) {
                const lockBox = lockBoxes1[i - 1];
                const vestingId = await lockBox.computeVestingScheduleIdForAddressAndIndex(accounts[i].address, 0);
                //console.log(vestingId);
                const releasable = await lockBox.computeReleasableAmount(vestingId)
                let balance0 = await usdToken.balanceOf(accounts[i].address);
                await lockBox.connect(accounts[i]).release(vestingId, releasable);
                let balance = await usdToken.balanceOf(lockBox.address);
                // another 1/4
                expect(balance).to.be.equal(lockedAmount * 2 / 4);
                let balance1 = await usdToken.balanceOf(accounts[i].address);
                // to beneficiary
                expect(balance1 - balance0).to.be.equal(lockedAmount / 4);
            }

            // end of year 4 - 1s
            await increaseTime(sliceSeconds);

            for (i = 1; i < 5; i++) {
                const lockBox = lockBoxes1[i - 1];
                const vestingId = await lockBox.computeVestingScheduleIdForAddressAndIndex(accounts[i].address, 0);
                //console.log(vestingId);
                const releasable = await lockBox.computeReleasableAmount(vestingId)
                let balance0 = await usdToken.balanceOf(accounts[i].address);
                await lockBox.connect(accounts[i]).release(vestingId, releasable);
                let balance = await usdToken.balanceOf(lockBox.address);
                // another 1/4
                expect(balance).to.be.equal(lockedAmount * 1 / 4);
                let balance1 = await usdToken.balanceOf(accounts[i].address);
                // to beneficiary
                expect(balance1 - balance0).to.be.equal(lockedAmount / 4);
            }

            // end of year 4, after anniversary
            await increaseTime(skew + 1);

            for (i = 1; i < 5; i++) {
                const lockBox = lockBoxes1[i - 1];
                const vestingId = await lockBox.computeVestingScheduleIdForAddressAndIndex(accounts[i].address, 0);
                //console.log(vestingId);
                const releasable = await lockBox.computeReleasableAmount(vestingId)
                let balance0 = await usdToken.balanceOf(accounts[i].address);
                await lockBox.connect(accounts[i]).release(vestingId, releasable);
                let balance = await usdToken.balanceOf(lockBox.address);
                // another 1/4
                expect(balance).to.be.equal(0);
                let balance1 = await usdToken.balanceOf(accounts[i].address);
                // to beneficiary
                expect(balance1 - balance0).to.be.equal(lockedAmount / 4);
            }
        });
    });

});

