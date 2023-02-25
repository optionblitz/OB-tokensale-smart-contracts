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

describe('BLX Presale', function () {
    let accounts, admin, kyc, usdToken, blxToken, blxPresale, ibco, ibco1, getPresaleBalance, getIBCOBalance, forwarder, tokenSale, startPresale, startSale;
    beforeEach(async () => {
        accounts = await ethers.getSigners();
        admin = accounts[0];

        const USDC = await ethers.getContractFactory("USDC");
        usdToken = await USDC.deploy("USDC", "USDC");

        //const Forwarder = await ethers.getContractFactory("BiconomyForwarder");
        const Forwarder = await ethers.getContractFactory("Test2771Forwarder");
        forwarder = await Forwarder.deploy();

        const BlxToken = await ethers.getContractFactory("contracts/flattened/BlxToken.sol:BlxToken");
        blxToken = await BlxToken.deploy(AddressZero);

        const TokenSale = await ethers.getContractFactory("TokenSale");
        tokenSale = await TokenSale.deploy(forwarder.address, usdToken.address);

        const BlxPresale = await ethers.getContractFactory("BlxPresale");
        blxPresale = await BlxPresale.deploy(
            forwarder.address,
            usdToken.address,
            blxToken.address,
            tokenSale.address
        );

        const IBCO = await ethers.getContractFactory("IBCO");
        ibco = await IBCO.deploy(
            forwarder.address,
            usdToken.address,
            blxToken.address,
            tokenSale.address
        );

        ibco1 = await IBCO.deploy(
            forwarder.address,
            usdToken.address,
            blxToken.address,
            tokenSale.address
        );

        await tokenSale.setAddresses(blxPresale.address, ibco.address);

        await blxPresale.config(
            admin.address,
            ibco.address,
            PRESALE_END,
            ADD_TIME,
            SOFT_CAP_PRESALE,
            HARD_CAP_PRESALE,
            Math.round(Date.now()/1000)
        );


        await ibco.config(
            blxPresale.address,
            admin.address,
            admin.address,
            IBCO_END,
            SOFT_CAP,
            HARD_CAP,
            Math.round(Date.now()/1000)
        );

        await ibco1.config(
            blxPresale.address,
            admin.address,
            admin.address,
            IBCO_END,
            SOFT_CAP,
            HARD_CAP,
            Math.round(Date.now()/1000)
        );

        //give everyone 1M USD
        await accounts.forEach(async (u) => {
            await usdToken.mint(u.address, 1000000 * 1e6);
            await usdToken.connect(u).approve(blxPresale.address, 1000000 * 1e6);
        });

        //presale offering 10MM BLX
        //await blxToken.transfer(blxPresale.address, 10000000 * 1e6 + 4000000 * 1e6);

        //ibco offering 30MM BLX
        //await blxToken.transfer(ibco.address, 30000000 * 1e6);

        await blxPresale.addTrustedAddress(admin.address);
        await ibco.addTrustedAddress(admin.address);
        await ibco1.addTrustedAddress(admin.address);

        await blxPresale.setMinAmount(MIN_AMOUNT_PRESALE);
        await ibco.setMinAmount(MIN_AMOUNT);

        await blxPresale.setTxCost(5 * 1e6);
        await ibco.setTxCost(5 * 1e6);


        getPresaleBalance = async () => {
            let usdBalance = await usdToken.balanceOf(blxPresale.address);
            let blxBalance = await blxToken.balanceOf(blxPresale.address);
            //console.log("Presale balance:", `${usdBalance / 1e6} USDC, ${blxBalance / 1e6} BLX`);
        }
        getIBCOBalance = async () => {
            let usdBalance = await usdToken.balanceOf(ibco.address);
            let blxBalance = await blxToken.balanceOf(ibco.address);
            //console.log("IBCO balance:", `${usdBalance / 1e6} USDC, ${blxBalance / 1e6} BLX`);
        }

        startSale = async () => {
            //ibco offering 30MM BLX
            await blxToken.transfer(ibco.address, 30000000 * 1e6);
            return ibco.start();
        }

        startPresale = async () => {
            //presale offering 10MM BLX + max 10% total sale(10M + 30M) for rewards
            await blxToken.transfer(blxPresale.address, 10000000 * 1e6 + 4000000 * 1e6);
            return blxPresale.start();
        }

        getPresaleBalance();
        getIBCOBalance();
    });

    describe("Positive tests", async () => {
        it('Admin can initialize presale start', async function () {
            let isActive = await blxPresale.presaleActive();
            expect(isActive).to.be.equal(false);
            await startPresale();
            isActive = await blxPresale.presaleActive();
            expect(isActive).to.be.equal(true);
        });
        it('Investors can send USD collateral after presale start', async function () {
            await startPresale();
            let usdBalanceBefore = await usdToken.balanceOf(blxPresale.address);
            let amount = 777 * 1e6;
            await blxPresale.connect(accounts[1]).enterPresale(amount, AddressZero);
            //console.log(`Investor sent ${amount / 1e6} USDC`);
            await getPresaleBalance();
            let usdBalanceAfter = await usdToken.balanceOf(blxPresale.address);
            expect(usdBalanceAfter).to.be.equal(usdBalanceBefore + amount);
        });
        it('Claim and refund are available after 14 days and if whitelist is ready and soft cap is reached', async function () {
            let amount = 20000 * 1e6;
            await startPresale();
            for (let i = 1; i < accounts.length; i++) {
                await blxPresale.connect(accounts[i]).enterPresale(amount, AddressZero);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }
            await getPresaleBalance();
            //Skip 14 days
            await increaseTime(PRESALE_END);
            //Prepare our whitelist
            const addresses = accounts.map(el => el.address);
            const goodGuys = addresses.slice(1, 11);
            const badGuys = addresses.slice(11, 20);
            //Inform contract that whitelist is ready

            //Check how many whitelisted collaterals we have
            amountFromWhitelisted = await blxPresale.amountFromWhitelisted();
            //console.log('USD amount from whitelist investors: ', amountFromWhitelisted / 1e6);
            //Claim and refund
            //Investors in the whitelist can claim
            for (i = 1; i < 11; i++) {
                await blxPresale.connect(accounts[i]).claim();
                let balanceBlx = await blxToken.balanceOf(accounts[i].address);
                //console.log('Investor claimed: ', balanceBlx / 1e6, 'BLX');
                expect(balanceBlx).to.be.equal(amount * 10); //1 BLX = 0.1 USDC
            }
            await getPresaleBalance();
            //Investors not in the whitelist can refund
            // for(i=11; i<20;i++){
            //     let balanceBefore = await usdToken.balanceOf(accounts[i].address);
            //     await blxPresale.connect(accounts[i]).refund(AddressZero);
            //     balanceAfter = await usdToken.balanceOf(accounts[i].address);
            //     //console.log('Investor refunded: ', (balanceAfter - balanceBefore)/1e6, 'USDC');
            //     expect(balanceAfter - balanceBefore).to.be.equal(amount); 
            // }
        });
        it.skip('Refund is available after 14 days and if whitelist is ready', async function () {
            let amount = 10000 * 1e6;
            await startPresale();
            for (let i = 1; i < accounts.length; i++) {
                await blxPresale.connect(accounts[i]).enterPresale(amount, AddressZero);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }
            await getPresaleBalance();
            //Skip 14 days
            await increaseTime(PRESALE_END);
            //Prepare our whitelist
            const addresses = accounts.map(el => el.address);
            const goodGuys = addresses.slice(1, 11);
            const badGuys = addresses.slice(11, 20);
            //Inform contract that whitelist is ready

            //Check how many whitelisted collaterals we have
            amountFromWhitelisted = await blxPresale.amountFromWhitelisted();
            //console.log('USD amount from whitelist investors: ', amountFromWhitelisted / 1e6);
            //Anyone can refund
            for (i = 1; i < 20; i++) {
                let balanceBefore = await usdToken.balanceOf(accounts[i].address);
                await blxPresale.connect(accounts[i]).refund(AddressZero);
                balanceAfter = await usdToken.balanceOf(accounts[i].address);
                //console.log('Investor refunded: ', (balanceAfter - balanceBefore) / 1e6, 'USDC');
                expect(balanceAfter - balanceBefore).to.be.equal(amount);
            }
            amountFromWhitelisted = await blxPresale.amountFromWhitelisted();
            //console.log('USD amount from whitelist investors: ', amountFromWhitelisted / 1e6);
        });
        it('Claim and refund are available before presale end if hard cap is reached and whitelist is ready', async function () {
            let amount = 100000 * 1e6;
            await startPresale();
            for (let i = 1; i < 11; i++) {
                await blxPresale.connect(accounts[i]).enterPresale(amount, AddressZero);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }
            //Prepare our whitelist
            const addresses = accounts.map(el => el.address);
            const goodGuys = addresses.slice(1, 11);
            const badGuys = addresses.slice(11, 20);
            //Inform contract that whitelist is ready

            //Check how many whitelisted collaterals we have
            await getPresaleBalance();
            amountFromWhitelisted = await blxPresale.amountFromWhitelisted();
            //console.log('USD amount from whitelist investors: ', amountFromWhitelisted / 1e6);
            //Claim and refund
            //Investors in the whitelist can claim
            for (i = 1; i < 11; i++) {
                await blxPresale.connect(accounts[i]).claim();
                let balanceBlx = await blxToken.balanceOf(accounts[i].address);
                //console.log('Investor claimed: ', balanceBlx / 1e6, 'BLX');
                expect(balanceBlx).to.be.equal(amount * 10); //1 BLX = 0.1 USDC
            }
            await getPresaleBalance();
            //Investors not in the whitelist can refund
            // for(i=11; i<20;i++){
            //     let balanceBefore = await usdToken.balanceOf(accounts[i].address);
            //     await blxPresale.connect(accounts[i]).refund(AddressZero);
            //     balanceAfter = await usdToken.balanceOf(accounts[i].address);
            //     //console.log('Investor refunded: ', (balanceAfter - balanceBefore)/1e6, 'USDC');
            //     expect(balanceAfter - balanceBefore).to.be.equal(amount); 
            // }
        });
        it('Claim and refund are available after 30 days if whitelist is not ready', async function () {
            let amount = 20000 * 1e6;
            await startPresale();
            for (let i = 1; i < accounts.length; i++) {
                await blxPresale.connect(accounts[i]).enterPresale(amount, AddressZero);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }
            await getPresaleBalance();
            //Skip 30 days
            await increaseTime(ADD_TIME);
            //refunds are available
            // for(i=11; i<20;i++){
            //     let balanceBefore = await usdToken.balanceOf(accounts[i].address);
            //     await blxPresale.connect(accounts[i]).refund(AddressZero);
            //     balanceAfter = await usdToken.balanceOf(accounts[i].address);
            //     //console.log('Investor refunded: ', (balanceAfter - balanceBefore)/1e6, 'USDC');
            //     expect(balanceAfter - balanceBefore).to.be.equal(amount); 
            // }
            await getPresaleBalance();
            //admin still needs to upload whitelist for users to claim their BLX
            const addresses = accounts.map(el => el.address);
            const goodGuys = addresses.slice(1, 11);
            const badGuys = addresses.slice(11, 20);
            //Inform contract that whitelist is ready

            //Check how many whitelisted collaterals we have
            await getPresaleBalance();
            amountFromWhitelisted = await blxPresale.amountFromWhitelisted();
            //console.log('USD amount from whitelist investors: ', amountFromWhitelisted / 1e6);
            //Investors in the whitelist can claim
            for (i = 1; i < 11; i++) {
                await blxPresale.connect(accounts[i]).claim();
                let balanceBlx = await blxToken.balanceOf(accounts[i].address);
                //console.log('Investor claimed: ', balanceBlx / 1e6, 'BLX');
                expect(balanceBlx).to.be.equal(amount * 10); //1 BLX = 0.1 USDC
            }
            await getPresaleBalance();
        });
        it('If sale ended admin can transfer all funds to DAO agent address', async function () {
            let amount = 20000 * 1e6;
            await startPresale();
            for (let i = 1; i < accounts.length; i++) {
                await blxPresale.connect(accounts[i]).enterPresale(amount, AddressZero);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }
            await getPresaleBalance();
            //Skip 14 days
            await increaseTime(PRESALE_END);
            //Prepare our whitelist
            const addresses = accounts.map(el => el.address);
            const goodGuys = addresses.slice(1, 11);
            const badGuys = addresses.slice(11, 20);
            //Inform contract that whitelist is ready

            //Check how many whitelisted collaterals we have
            amountFromWhitelisted = await blxPresale.amountFromWhitelisted();
            //console.log('USD amount from whitelist investors: ', amountFromWhitelisted / 1e6);
            //Transfer USDC from whitelisted investors to DAO agent
            let agentBalanceBefore = await usdToken.balanceOf(admin.address);
            await blxPresale.transferToDaoAgent();
            let agentBalanceAfter = await usdToken.balanceOf(admin.address);
            expect(agentBalanceAfter).to.be.equal(agentBalanceBefore.add(amountFromWhitelisted));
            await getPresaleBalance();
        });
        it('Token sale ends if true hard cap is reached, also we can load whitelists anytime', async function () {
            let amount = 20000 * 1e6;
            await startPresale();
            for (let i = 1; i < 15; i++) {
                await blxPresale.connect(accounts[i]).enterPresale(amount, AddressZero);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }
            await getPresaleBalance();
            //Prepare our whitelist
            const addresses = accounts.map(el => el.address);
            let goodGuys = addresses.slice(1, 5);
            const badGuys = addresses.slice(5, 15);
            //Load whitelist during presale
            //Inform contract that whitelist is ready

            //console.log('Whitelist updated');
            //Check how many whitelisted collaterals we have
            amountFromWhitelisted = await blxPresale.amountFromWhitelisted();
            //console.log('USD amount from whitelist investors: ', amountFromWhitelisted / 1e6);
            //Update whitelist with new addresses, also we can send some guys from blacklist to whitelist
            goodGuys = addresses.slice(14, 20);
            //console.log('Whitelist updated');
            amountFromWhitelisted = await blxPresale.amountFromWhitelisted();
            //console.log('USD amount from whitelist investors: ', amountFromWhitelisted / 1e6);
            //Other investor commit USDC
            for (let i = 15; i < 20; i++) {
                await blxPresale.connect(accounts[i]).enterPresale(amount, AddressZero);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }
            //Same account can commit multiple times
            await blxPresale.connect(accounts[19]).enterPresale(400000 * 1e6, AddressZero);
            await blxPresale.connect(accounts[19]).enterPresale(220000 * 1e6, AddressZero);
            let { amount: investedAmount } = await blxPresale.collaterals(accounts[19].address);
            //console.log('\nInvestor sent total: ', investedAmount / 1e6);
            expect(investedAmount).to.be.equal(640000 * 1e6);
            amountFromWhitelisted = await blxPresale.amountFromWhitelisted();
            //console.log('USD amount from whitelist investors: ', amountFromWhitelisted / 1e6);
            expect(amountFromWhitelisted).to.be.equal(1000000 * 1e6); //hard cap from whitelisted
            await getPresaleBalance();
            //Hard cap reached, presale closed
            await expect(blxPresale.connect(accounts[18]).enterPresale(400000 * 1e6, AddressZero))
                .to.be.revertedWith("PRESALE:PRESALE_CLOSED");
        });

        it('Referer can claim both reward and purchase in one step(with unsold burn before claim)', async function () {
            let amount = 20000 * 1e6;
            await startPresale();

            const referrer = accounts[1].address;
            //console.log(`referrer ${referrer}`);
            for (let i = 1; i < 15; i++) {
                // 14 purchase
                await blxPresale.connect(accounts[i]).enterPresale(amount, referrer);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }

            //Skip 14 days
            await increaseTime(PRESALE_END);

            //burn unsold
            await blxPresale.burnUnsoldBLX();

            for (let i = 1; i < 15; i++) {
                await blxPresale.connect(accounts[i]).claim();
                const blxBalance = await blxToken.balanceOf(accounts[i].address);
                if (i === 1) {
                    //10% of referred blx(13) and self-referral is ignored
                    expect(blxBalance).to.be.equal(200000 * 1e6 + (13 * 20000 * 10 / 10) * 1e6);
                }
                //console.log(`${accounts[i].address} BLX claimed ${blxBalance / 1e6}`);
            }
        });

        it('Burn unsold BLX after sales end', async function () {
            let amount = 20000 * 1e6;
            await startPresale();

            const referrer = accounts[1].address;
            //console.log(`referrer ${referrer}`);
            for (let i = 1; i < 15; i++) {
                // 14 purchase
                await blxPresale.connect(accounts[i]).enterPresale(amount, referrer);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }

            //Skip 14 days
            await increaseTime(PRESALE_END);

            for (let i = 1; i < 11; i++) {
                await blxPresale.connect(accounts[i]).claim();
                const blxBalance = await blxToken.balanceOf(accounts[i].address);
                if (i === 1) {
                    //10% of referred blx(13) and self-referral is ignored
                    expect(blxBalance).to.be.equal(200000 * 1e6 + (13 * 20000 * 10 / 10) * 1e6);
                }
                //console.log(`${accounts[i].address} BLX claimed ${blxBalance / 1e6}`);
            }
            
            await blxPresale.burnUnsoldBLX();
        });

        it('Burn unsold BLX after sales end(before claim)', async function () {
            let amount = 20000 * 1e6;
            await startPresale();

            const referrer = accounts[1].address;
            //console.log(`referrer ${referrer}`);
            for (let i = 1; i < 15; i++) {
                // 14 purchase
                await blxPresale.connect(accounts[i]).enterPresale(amount, referrer);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }

            //Skip 14 days
            await increaseTime(PRESALE_END);

            await blxPresale.burnUnsoldBLX();

            // claim all including rewards
            for (let i = 1; i < 15; i++) {
                await blxPresale.connect(accounts[i]).claim();
                const blxBalance = await blxToken.balanceOf(accounts[i].address);
                if (i === 1) {
                    //10% of referred blx(13) and self-referral is ignored
                    expect(blxBalance).to.be.equal(200000 * 1e6 + (13 * 20000 * 10 / 10) * 1e6);
                }
                //console.log(`${accounts[i].address} BLX claimed ${blxBalance / 1e6}`);
            }
        });

        it('Change ibco address after presale end, before ibco begin', async function () {
            let amount = 20000 * 1e6;
            await startPresale();

            const referrer = accounts[1].address;
            //console.log(`referrer ${referrer}`);
            for (let i = 1; i < 15; i++) {
                // 14 purchase
                await blxPresale.connect(accounts[i]).enterPresale(amount, referrer);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }

            //Skip 28 days
            await increaseTime(PRESALE_END);
            //set IBCO address again
            await blxPresale.setIBCO(ibco.address);
        });

        it('Burn all remaining BLX after ibco sales end', async function () {
            let amount = 20000 * 1e6;
            await startPresale();

            const referrer = accounts[1].address;
            //console.log(`referrer ${referrer}`);
            for (let i = 1; i < 15; i++) {
                // 14 purchase
                await blxPresale.connect(accounts[i]).enterPresale(amount, referrer);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }

            //Skip 14 days
            await increaseTime(PRESALE_END);

            await blxPresale.burnUnsoldBLX();

            await startSale();

            await increaseTime(IBCO_END);
            // another 90 days
            await increaseTime(60*60*24*90);

            await ibco.burnRemainingBLX();

            // claim all including rewards
            for (let i = 1; i < 15; i++) {
                await blxPresale.connect(accounts[i]).claim();
                const blxBalance = await blxToken.balanceOf(accounts[i].address);
                if (i === 1) {
                    //reward forfeit(too layte)
                    expect(blxBalance).to.be.equal(200000 * 1e6);
                }
                //console.log(`${accounts[i].address} BLX claimed ${blxBalance / 1e6}`);
            }
            expect(await blxToken.balanceOf(ibco.address)).to.be.equal(0);
            expect(await blxToken.balanceOf(blxPresale.address)).to.be.equal(0);
        });
        it('Purchase via forwarder(gasless tx)', async function () {
            let amount = 20000 * 1e6;
            await startPresale();

            const referrer = accounts[1].address;
            //console.log(`referrer ${referrer}`);
            for (let i = 1; i < 15; i++) {
                // 14 purchase
                await blxPresale.connect(accounts[i]).enterPresale(amount, referrer);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }
            const txCost = await blxPresale.txCost();
            for (let i = 16; i < 17; i++) {
                
                const balance0 = await usdToken.balanceOf(accounts[i].address);
                const txData = (await tokenSale.populateTransaction["enterPresale"](amount, AddressZero,"0x","0x")).data;
                await forwarder.connect(accounts[0]).execute(accounts[i].address, tokenSale.address, txData, 400000);
                const balance1 = await usdToken.balanceOf(accounts[i].address);
                expect(balance0.sub(amount).sub(txCost)).to.be.equal(balance1);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }
            //Skip 14 days
            await increaseTime(PRESALE_END);
            const daoAgentAddress = await blxPresale.daoAgentAddress();
            const balance0 = await usdToken.balanceOf(daoAgentAddress);
            await blxPresale.transferToDaoAgent();

            // receive both purchase and tx cost
            expect((balance0).add(amount * 15).add(txCost.mul(1))).to.be.equal(await usdToken.balanceOf(daoAgentAddress));

        });
        it('Purchase via forwarder(gasless tx), softcap not reach', async function () {
            let amount = 20000 * 1e6;
            await startPresale();

            const referrer = accounts[1].address;
            //console.log(`referrer ${referrer}`);
            for (let i = 1; i < 5; i++) {
                // 4 purchase
                await blxPresale.connect(accounts[i]).enterPresale(amount, referrer);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }
            const txCost = await blxPresale.txCost();
            for (let i = 6; i < 8; i++) {
                // 2 purchases
                const balance0 = await usdToken.balanceOf(accounts[i].address);
                const txData = (await tokenSale.populateTransaction["enterPresale"](amount, AddressZero,"0x","0x")).data;
                await forwarder.connect(accounts[0]).execute(accounts[i].address, tokenSale.address, txData, 400000);
                const balance1 = await usdToken.balanceOf(accounts[i].address);
                expect(balance0.sub(amount).sub(txCost)).to.be.equal(balance1);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }

            //Skip 14 days
            await increaseTime(PRESALE_END);
            const daoAgentAddress = await blxPresale.daoAgentAddress();
            const balance0 = await usdToken.balanceOf(daoAgentAddress);
            await blxPresale.transferTxFee();
            // receive tx cost
            expect((balance0).add(txCost.mul(2))).to.be.equal(await usdToken.balanceOf(daoAgentAddress));

            for (let i = 1; i < 8; i++) {
                await blxPresale.connect(accounts[i]).refund(AddressZero);
            }
        });

        it('Purchase via forwarder(gasless tx), extra tx fee in between', async function () {
            let amount = 1000 * 1e6;
            await startPresale();

            const referrer = accounts[1].address;
            const daoAgentAddress = await blxPresale.daoAgentAddress();
            const txCost = await blxPresale.txCost();
            for (let i = 1; i < 20; i++) {
                // 2 purchases
                const balance0 = await usdToken.balanceOf(accounts[i].address);
                const txData = (await tokenSale.populateTransaction["enterPresale"](amount, AddressZero,"0x","0x")).data;
                await forwarder.connect(accounts[0]).execute(accounts[i].address, tokenSale.address, txData, 400000);
                const balance1 = await usdToken.balanceOf(accounts[i].address);
                expect(balance0.sub(amount).sub(txCost)).to.be.equal(balance1);
                await blxPresale.transferTxFee();
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }

            //Skip 14 days
            await increaseTime(PRESALE_END);

            for (let i = 1; i < 20; i++) {
                await blxPresale.connect(accounts[i]).refund(AddressZero);
            }
        });
        
        it('Purchase via forwarder(gasless tx), softcap not reach(refund first)', async function () {
            let amount = 20000 * 1e6;
            await startPresale();

            const referrer = accounts[1].address;
            //console.log(`referrer ${referrer}`);
            for (let i = 1; i < 5; i++) {
                // 4 purchase
                await blxPresale.connect(accounts[i]).enterPresale(amount, referrer);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }
            const txCost = await blxPresale.txCost();
            for (let i = 6; i < 8; i++) {
                // 2 purchases
                const balance0 = await usdToken.balanceOf(accounts[i].address);
                const txData = (await tokenSale.populateTransaction["enterPresale"](amount, AddressZero,"0x","0x")).data;
                await forwarder.connect(accounts[0]).execute(accounts[i].address, tokenSale.address, txData, 400000);
                const balance1 = await usdToken.balanceOf(accounts[i].address);
                expect(balance0.sub(amount).sub(txCost)).to.be.equal(balance1);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }

            //Skip 14 days
            await increaseTime(PRESALE_END);
            const daoAgentAddress = await blxPresale.daoAgentAddress();
            const balance0 = await usdToken.balanceOf(daoAgentAddress);

            for (let i = 1; i < 8; i++) {
                await blxPresale.connect(accounts[i]).refund(AddressZero);
            }
            // receive tx cost as part of the refund process
            expect((balance0).add(txCost.mul(2))).to.be.equal(await usdToken.balanceOf(daoAgentAddress));
        });

        it('can return BLX if not started', async function () {
            await blxToken.transfer(blxPresale.address, 30000000 * 1e6);
            await blxPresale.returnBLX();
        });

    })
    describe("Negative tests", async () => {
        it("Can't call purchase except tokensale contract", async function () {

            await startPresale();

            await expect(blxPresale.connect(accounts[0]).purchase(1e6, AddressZero, accounts[1].address, false))
                .to.be.revertedWith("PRESALE:ONLY_FROM_TOKENSALE");
        });

        it("Can't start twice", async function () {
            await startPresale();
            await expect(startPresale())
                .to.be.revertedWith("PRESALE:ALREADY_STARTED");
        });

        it("Can't start without enough BLX deposit", async function () {
            // just short by 1
            await blxToken.transfer(blxPresale.address, 10000000 * 1e6 + 1000000 * 1e6 - 1);
            await expect(blxPresale.start())
                .to.be.revertedWith("PRESALE:NEED_BLX");
            await blxToken.transfer(blxPresale.address, 1);
            // enough for presale
            await blxPresale.start();
        });

        it.skip("Can't claim if not in the whitelist", async function () {
            let amount = 20000 * 1e6;
            await startPresale();
            for (let i = 1; i < accounts.length; i++) {
                await blxPresale.connect(accounts[i]).enterPresale(amount, AddressZero);
                ////console.log(`Investor sent ${amount/1e6} USDC`);
            }
            await getPresaleBalance();
            //Skip 14 days
            await increaseTime(PRESALE_END);
            //Prepare our whitelist
            const addresses = accounts.map(el => el.address);
            const goodGuys = addresses.slice(1, 11);
            const badGuys = addresses.slice(11, 20);
            //Inform contract that whitelist is ready

            //Check how many whitelisted collaterals we have
            amountFromWhitelisted = await blxPresale.amountFromWhitelisted();
            //console.log('USD amount from whitelist investors: ', amountFromWhitelisted / 1e6);
            //Claim and refund
            //Investors not in the whitelist can't claim
            for (i = 11; i < 20; i++) {
                await expect(blxPresale.connect(accounts[i]).claim())
                    .to.be.revertedWith("PRESALE:NOT_IN_THE_WHITELIST");
            }
        });
        it("Can't claim or refund same investment twice", async function () {
            let amount = 20000 * 1e6;
            await startPresale();
            for (let i = 1; i < accounts.length; i++) {
                await blxPresale.connect(accounts[i]).enterPresale(amount, AddressZero);
                ////console.log(`Investor sent ${amount/1e6} USDC`);
            }
            await getPresaleBalance();
            //Skip 14 days
            await increaseTime(PRESALE_END);
            //Prepare our whitelist
            const addresses = accounts.map(el => el.address);
            const goodGuys = addresses.slice(1, 11);
            const badGuys = addresses.slice(11, 20);
            //Inform contract that whitelist is ready

            //Check how many whitelisted collaterals we have
            amountFromWhitelisted = await blxPresale.amountFromWhitelisted();
            //console.log('USD amount from whitelist investors: ', amountFromWhitelisted / 1e6);
            //Claim and refund
            //Can't claim or refund twice in a row
            for (i = 1; i < 11; i++) {
                await blxPresale.connect(accounts[i]).claim();
                await expect(blxPresale.connect(accounts[i]).claim())
                    .to.be.revertedWith("PRESALE:NOTHING_TO_CLAIM");
            }
            // for(i=11; i<20;i++){
            //     await blxPresale.connect(accounts[i]).refund(AddressZero);
            //     await expect(blxPresale.connect(accounts[i]).refund(AddressZero))
            //         .to.be.revertedWith("PRESALE:ALREADY_REFUNDED");
            // }
        });
        it("Minimal commit is 100 USDC", async function () {
            let amount = 99 * 1e6;
            await startPresale();
            for (let i = 1; i < accounts.length; i++) {
                await expect(blxPresale.connect(accounts[i]).enterPresale(amount, AddressZero))
                    .to.be.revertedWith("PRESALE:MIN_AMOUNT_REQUIREMENT_NOT_MET");
            }
        });
        it("Can't claim or refund during presale (14 days not passed, soft cap not reached in case of claim)", async function () {
            let amount = 10000 * 1e6;
            await startPresale();
            for (let i = 1; i < accounts.length; i++) {
                await blxPresale.connect(accounts[i]).enterPresale(amount, AddressZero);
                ////console.log(`Investor sent ${amount/1e6} USDC`);
            }
            await getPresaleBalance();
            //Prepare our whitelist
            const addresses = accounts.map(el => el.address);
            const goodGuys = addresses.slice(1, 11);
            const badGuys = addresses.slice(11, 20);
            //Inform contract that whitelist is ready

            //Check how many whitelisted collaterals we have
            amountFromWhitelisted = await blxPresale.amountFromWhitelisted();
            //console.log('USD amount from whitelist investors: ', amountFromWhitelisted / 1e6);
            //Claim and refund
            //Can't claim or refund during resale
            for (i = 1; i < 11; i++) {
                await expect(blxPresale.connect(accounts[i]).claim())
                    .to.be.revertedWith("PRESALE:PRESALE_IN_PROGRESS");
            }
            for (i = 11; i < 20; i++) {
                await expect(blxPresale.connect(accounts[i]).refund(AddressZero))
                    .to.be.revertedWith("PRESALE:PRESALE_IN_PROGRESS");
            }
            //Skip 14 days and try again with claim, soft cap not reached though
            await increaseTime(PRESALE_END);
            for (i = 1; i < 11; i++) {
                await expect(blxPresale.connect(accounts[i]).claim())
                    .to.be.revertedWith("PRESALE:NOTHING_TO_CLAIM");
            }
        });
        it.skip("Can't claim or refund if whitelist not ready (need to wait 30 days)", async function () {
            let amount = 20000 * 1e6;
            await startPresale();
            for (let i = 1; i < accounts.length; i++) {
                await blxPresale.connect(accounts[i]).enterPresale(amount, AddressZero);
                ////console.log(`Investor sent ${amount/1e6} USDC`);
            }
            await getPresaleBalance();
            //Skip 14 days
            await increaseTime(PRESALE_END);
            //Claim and refund
            //Can't claim or refund when whitelist not ready
            for (i = 1; i < 11; i++) {
                await expect(blxPresale.connect(accounts[i]).claim())
                    .to.be.revertedWith("PRESALE:KYC_NOT_READY");
            }
            for (i = 11; i < 20; i++) {
                await expect(blxPresale.connect(accounts[i]).refund(AddressZero))
                    .to.be.revertedWith("PRESALE:KYC_NOT_READY");
            }

        });
        it("Can't commit after presale has ended", async function () {
            let amount = 20000 * 1e6;
            await startPresale();
            //Skip 14 days
            await increaseTime(PRESALE_END);
            for (let i = 1; i < accounts.length; i++) {
                await expect(blxPresale.connect(accounts[i]).enterPresale(amount, AddressZero))
                    .to.be.revertedWith("PRESALE:PRESALE_CLOSED");
            }
        });
        it("Only admin can call admin funcs", async function () {
            let amount = 20000 * 1e6;
            await expect(blxPresale.connect(accounts[1]).start())
                .to.be.revertedWith("AC:ADDRESS_IS_NOT_TRUSTED");
            await expect(blxPresale.connect(accounts[1]).setMinAmount(10000))
                .to.be.revertedWith("AC:ADDRESS_IS_NOT_TRUSTED");
            await expect(blxPresale.connect(accounts[1]).setTxCost(1))
                .to.be.revertedWith("AC:ADDRESS_IS_NOT_TRUSTED");
            await expect(blxPresale.connect(accounts[1]).setIBCO(ibco.address))
                .to.be.revertedWith("AC:ADDRESS_IS_NOT_TRUSTED");
            await expect(blxPresale.connect(accounts[1]).returnBLX())
                .to.be.revertedWith("AC:ADDRESS_IS_NOT_TRUSTED");
            //Skip 14 days
            await increaseTime(PRESALE_END);
            await expect(blxPresale.connect(accounts[1]).transferToDaoAgent())
                .to.be.revertedWith("AC:ADDRESS_IS_NOT_TRUSTED");
        });

        it('cannot burn unsold BLX before sales end', async function () {
            let amount = 20000 * 1e6;
            await startPresale();

            const referrer = accounts[1].address;
            //console.log(`referrer ${referrer}`);
            for (let i = 1; i < 15; i++) {
                // 14 purchase
                await blxPresale.connect(accounts[i]).enterPresale(amount, referrer);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }
            
            await expect(blxPresale.burnUnsoldBLX())
                .to.be.revertedWith("PRESALE:PRESALE_IN_PROGRESS");
        });

        it('cannot double burn unsold BLX before sales end', async function () {
            let amount = 20000 * 1e6;
            await startPresale();

            const referrer = accounts[1].address;
            //console.log(`referrer ${referrer}`);
            for (let i = 1; i < 15; i++) {
                // 14 purchase
                await blxPresale.connect(accounts[i]).enterPresale(amount, referrer);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }
            //Skip 14 days
            await increaseTime(PRESALE_END);
            await blxPresale.burnUnsoldBLX();
            await expect(blxPresale.burnUnsoldBLX())
                .to.be.revertedWith("PRESALE:NO_UNSOLD_BLX");
        });

        it('cannot return BLX once started', async function () {
            let amount = 20000 * 1e6;
            await startPresale();

            //return BLX(should fail)
            await expect(blxPresale.returnBLX())
                .to.be.revertedWith("PRESALE:ALREADY_START");

        });

        it('cannot change ibco address after presale end, when ibco already started', async function () {
            let amount = 20000 * 1e6;
            await startPresale();

            const referrer = accounts[1].address;
            //console.log(`referrer ${referrer}`);
            for (let i = 1; i < 15; i++) {
                // 14 purchase
                await blxPresale.connect(accounts[i]).enterPresale(amount, referrer);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }

            //Skip 28 days
            await increaseTime(PRESALE_END);

            //start IBCO
            await startSale();

            //set IBCO address again(should fail)
            await expect(blxPresale.setIBCO(ibco.address))
                .to.be.revertedWith("PRESALE:IBCO_ALREADY_START");
        });

        it('cannot change ibco address after presale end, new ibco address empty', async function () {
            let amount = 20000 * 1e6;
            await startPresale();

            const referrer = accounts[1].address;
            //console.log(`referrer ${referrer}`);
            for (let i = 1; i < 15; i++) {
                // 14 purchase
                await blxPresale.connect(accounts[i]).enterPresale(amount, referrer);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }

            //Skip 28 days
            await increaseTime(PRESALE_END);

            //set IBCO address to empty(should fail)
            await expect(blxPresale.setIBCO(AddressZero))
                .to.be.revertedWith("PRESALE:ONLY_FRESH_IBCO");
        });

        it('cannot change ibco address after presale end, non-ibco contract', async function () {
            let amount = 20000 * 1e6;
            await startPresale();

            const referrer = accounts[1].address;
            //console.log(`referrer ${referrer}`);
            for (let i = 1; i < 15; i++) {
                // 14 purchase
                await blxPresale.connect(accounts[i]).enterPresale(amount, referrer);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }

            //Skip 28 days
            await increaseTime(PRESALE_END);

            //set IBCO address to wrong contract(should fail)
            await expect(blxPresale.setIBCO(blxPresale.address))
                .to.be.reverted;
        });

        it('cannot change ibco address after presale end, new ibco address already started', async function () {
            let amount = 20000 * 1e6;
            await startPresale();

            const referrer = accounts[1].address;
            //console.log(`referrer ${referrer}`);
            for (let i = 1; i < 15; i++) {
                // 14 purchase
                await blxPresale.connect(accounts[i]).enterPresale(amount, referrer);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }

            //Skip 28 days
            await increaseTime(PRESALE_END);

            //ibco offering 30MM BLX
            await blxToken.transfer(ibco1.address, 30000000 * 1e6);
            await ibco1.start();

            //set IBCO address to address that is already started(should fail)
            await expect(blxPresale.setIBCO(ibco1.address))
                .to.be.revertedWith("PRESALE:ONLY_FRESH_IBCO");
        });

    });
});

