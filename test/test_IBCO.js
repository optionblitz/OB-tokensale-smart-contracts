const { expect } = require('chai');
const { ethers } = require('hardhat');
const { clamp } = require('lodash');

const {
    increaseTime,
    latestBlockTimestamp
} = require("./common/utils.js");

const EPSILON = 5;
const USDC_DECIMALS = 6;
const AddressZero = "0x0000000000000000000000000000000000000000";
const PRESALE_END = 60 * 60 * 24 * 14; //14 days
const ADD_TIME = 60 * 60 * 24 * 30; //30 days
const MIN_AMOUNT_PRESALE = 100 * 1e6; // 100 USDC
const IBCO_END = 60 * 60 * 24 * 28; //28 days
const SOFT_CAP_PRESALE = 200000 * 1e6; //200,000 USDC
const HARD_CAP_PRESALE = 1000000 * 1e6; //1,000,000 USDC
const SOFT_CAP = 1000000 * 1e6; //1,000,000 USDC
const HARD_CAP = 10000000 * 1e6; //10,000,000 USDC using 1/3 rate
//const HARD_CAP = 9617880 * 1e6; //9,618,000 USDC, using 33% rate
const MIN_AMOUNT = 1 * 1e6; //1 USDC

function parseUsdc(value) {
    return ethers.utils.parseUnits(value, USDC_DECIMALS);
}

function toUsdc(value) {
    return ethers.utils.formatUnits(value, USDC_DECIMALS);
}

describe('IBCO sale', function () {
    let accounts, admin, kyc, usdToken, blxToken, blxPresale, ibco,
        triggerPresaleSuccess, calcBlxAmount, calcPrice,presaleDaoAgent,daoAgent,dao,
        getPresaleBalance, getIbcoBalance, forwarder, tokenSale, startSale, startPresale;
    beforeEach(async () => {
        accounts = await ethers.getSigners();
        admin = accounts[0];
        daoAgent = accounts[1];
        presaleDaoAgent = accounts[0];
        dao = accounts[2];

        const USDC = await ethers.getContractFactory("USDC");
        usdToken = await USDC.deploy("USDC", "USDC");

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

        await tokenSale.setAddresses(blxPresale.address, ibco.address);

        await blxPresale.config(
            presaleDaoAgent.address,
            ibco.address,
            PRESALE_END,
            ADD_TIME,
            SOFT_CAP_PRESALE,
            HARD_CAP_PRESALE,
            Math.round(Date.now() / 1000)
        );

        await ibco.config(
            blxPresale.address,
            daoAgent.address,
            dao.address,
            IBCO_END,
            SOFT_CAP,
            HARD_CAP,
            Math.round(Date.now() / 1000)
        );

        //give everyone 1M USD
        await accounts.forEach(async (u) => {
            await usdToken.mint(u.address, 1000000 * 1e6);
            await usdToken.connect(u).approve(ibco.address, 1000000 * 1e6);
            await usdToken.connect(u).approve(blxPresale.address, 1000000 * 1e6);
        });

        await blxPresale.addTrustedAddress(admin.address);
        await ibco.addTrustedAddress(admin.address);

        await blxPresale.setMinAmount(MIN_AMOUNT_PRESALE);
        await ibco.setMinAmount(MIN_AMOUNT);

        await blxPresale.setTxCost(5 * 1e6);
        await ibco.setTxCost(5 * 1e6);

        getPresaleBalance = async () => {
            let usdBalance = await usdToken.balanceOf(blxPresale.address);
            let blxBalance = await blxToken.balanceOf(blxPresale.address);
            //console.log("Presale balance:", `${usdBalance / 1e6} USDC, ${blxBalance / 1e6} BLX`);
        }

        getIbcoBalance = async () => {
            let usdBalance = await usdToken.balanceOf(ibco.address);
            let blxBalance = await blxToken.balanceOf(ibco.address);
            //console.log("\nIBCO balance:", `${usdBalance / 1e6} USDC, ${blxBalance / 1e6} BLX`);
            let price = await ibco.currentPrice();
            //console.log('Price: ', (price / 1e6).toString());
        }

        triggerPresaleSuccess = async () => {
            //presale offering 10MM BLX + max 10% total sale(10M + 30M) for rewards
            await blxToken.transfer(blxPresale.address, 10000000 * 1e6 + 4000000 * 1e6);

            let amount = 20000 * 1e6;
            await startPresale();
            for (let i = 1; i < accounts.length; i++) {
                await blxPresale.connect(accounts[i]).enterPresale(amount, AddressZero);
            }
            //Prepare our whitelist
            const addresses = accounts.map(el => el.address);
            const goodGuys = addresses.slice(0, 20);
        }

        calcPrice = (blxSold, blxToBuy) => {
            //const k1 = 1 + 33 / 100;
            const k1 = 1 + 1 / 3;
            const k2 = 0.001 / k1;
            const usdcNeeded = k2 * Math.pow(blxSold + blxToBuy, k1) - k2 * Math.pow(blxSold, k1) + 0.1 * blxToBuy;
            const price = usdcNeeded / blxToBuy;
            return { usdcNeeded, price };
        }

        calcBlxAmount = (blxSold, currentPrice, usdc) => {
            let startPrice = currentPrice;
            let blxToBuy = Math.round(usdc / startPrice);
            let { usdcNeeded, price } = calcPrice(blxSold, blxToBuy);
            // bsearch for the 'target price' thus the amount of blx
            while (Math.abs(usdcNeeded - usdc) >= 1) {
                blxToBuy = Math.round(usdc / ((startPrice + price) / 2));
                ({ usdcNeeded, price } = calcPrice(blxSold, blxToBuy));
                startPrice = price;
            }
            //console.log(`${usdc} ${usdcNeeded} ${price} ${blxToBuy}`);
            return { usdcNeeded, blxToBuy, price };
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
        getIbcoBalance();
    });

    describe("Positive tests", async () => {
        it('Admin can initialize sale start', async function () {
            let status = await ibco.ibcoActive();
            expect(status).to.be.equal(false);

            await triggerPresaleSuccess();
            await startSale();
            status = await ibco.ibcoActive();
            expect(status).to.be.equal(true);
        });

        it('can return BLX if not started', async function () {
            await blxToken.transfer(ibco.address, 30000000 * 1e6);
            await ibco.returnBLX();
        });

        it('Can start after partial claim in presale including rewards', async function () {
            // presale hard cap + 10% of 40M
            await blxToken.transfer(blxPresale.address, HARD_CAP_PRESALE * 10 + 4000000 * 1e6);
            //console.log((await blxToken.balanceOf(blxPresale.address)).toNumber());
            await blxPresale.start();
            const referrer = accounts[0].address;
            let amount = 500000 * 1e6;

            // purchase all with rewards
            for (let i = 0; i < 2; i++) {
                await blxPresale.connect(accounts[i]).enterPresale(amount, referrer);
            }
            const [unused, claimable] = await blxPresale.burnableBLX();
            //console.log(unused.toNumber(), claimable.toNumber());
            await increaseTime(PRESALE_END);
            // claim some BLX
            await blxPresale.connect(accounts[0]).claim();
            // flush left over BLX
            await expect(blxPresale.burnUnsoldBLX()).to.be.revertedWith("PRESALE:NO_UNSOLD_BLX");

            await blxToken.transfer(ibco.address, HARD_CAP * 3);
            //console.log((await blxPresale.blxObligation()).toNumber());
            //console.log((await blxToken.balanceOf(blxPresale.address)).toNumber());
            await ibco.start();
        });

        it('Can start after partial claim in presale(hardcap not reach, burn unsold) including rewards', async function () {
            // presale hard cap + 10% of 40M
            await blxToken.transfer(blxPresale.address, HARD_CAP_PRESALE * 10 + 4000000 * 1e6);
            //console.log((await blxToken.balanceOf(blxPresale.address)).toNumber());
            await blxPresale.start();
            const referrer = accounts[0].address;
            let amount = 500000 * 1e6;

            // purchase all with rewards
            for (let i = 1; i < 2; i++) {
                await blxPresale.connect(accounts[i]).enterPresale(amount, referrer);
            }
            const [unused, claimable] = await blxPresale.burnableBLX();
            //console.log(unused.toNumber(), claimable.toNumber());
            await increaseTime(PRESALE_END);
            // claim some BLX
            await blxPresale.connect(accounts[0]).claim();
            await blxPresale.connect(accounts[1]).claim();
            // flush left over BLX
            await blxPresale.burnUnsoldBLX();

            await blxToken.transfer(ibco.address, HARD_CAP * 3);
            //console.log((await blxPresale.blxObligation()).toNumber());
            //console.log((await blxToken.balanceOf(blxPresale.address)).toNumber());
            await ibco.start();
        });

        it('Investors can send USDC after sale start, price changes accordingly to distributed BLX amount', async function () {
            let amount = 100000 * 1e6;

            await triggerPresaleSuccess();
            await startSale();
            //For simplicity we assume that everyone is whitelisted
            //Prepare our whitelist
            const addresses = accounts.map(el => el.address);
            const goodGuys = addresses.slice(0, 20);

            let distributedBlxJs = 0;
            let distributedBlx = await ibco.distributedBlx();
            expect(distributedBlx).to.be.equal(0);
            for (let i = 0; i < accounts.length; i++) {
                distributedBlx = await ibco.distributedBlx();
                //console.log(toUsdc(distributedBlx));
                const { usdcNeeded, blxAmount, price18, i: round } = await ibco.calcBlxAmount(amount);
                let currentPrice = await ibco.currentPrice();
                //console.log(toUsdc(usdcNeeded), toUsdc(blxAmount), ethers.utils.formatUnits(price18, 18), i.toString());
                const { _, blxToBuy, price: priceJs } = calcBlxAmount(+toUsdc(distributedBlx), +toUsdc(currentPrice), amount / 1e6);
                // expect(price/1e6).to.be.within(
                //     priceJs/1e6 - EPSILON,
                //     priceJs/1e6 + EPSILON
                // );

                //console.log(`${i} Investor sent ${amount / 1e6} USDC`);
                await ibco.connect(accounts[i]).enterIbco(blxAmount, amount, AddressZero);

                distributedBlxJs += Math.round(blxToBuy) * 1e6;
                distributedBlx = await ibco.distributedBlx();

                //console.log(`\nBLX price ${(price18 / 1e18).toString()} USDC`);
                //console.log(`BLX price JS ${priceJs / 1e6} USDC`);
                //console.log(`\nDistributed BLX ${(distributedBlx / 1e6).toString()}`);
                //console.log(`Distributed BLX JS ${(distributedBlxJs / 1e6)}`);

                expect(distributedBlx / 1e6).to.be.within(
                    distributedBlxJs / 1e6 - EPSILON,
                    distributedBlxJs / 1e6 + EPSILON
                );

            }
            await getIbcoBalance();
        });

        it('Claim and refund are available after 28 days and if soft cap is reached', async function () {
            let amount = 100000 * 1e6;
            let prices = [];

            await triggerPresaleSuccess();
            await startSale();

            for (let i = 0; i < accounts.length; i++) {
                let distributedBlx = await ibco.distributedBlx();
                let currentPrice = await ibco.currentPrice();
                const { _, blxToBuy, price: priceJs } = calcBlxAmount(+toUsdc(distributedBlx), +toUsdc(currentPrice), amount / 1e6);
                const { usdcNeeded, blxAmount, price18, i: round } = await ibco.calcBlxAmount(amount);
                prices.push(+ethers.utils.formatUnits(price18, 12));
                await ibco.connect(accounts[i]).enterIbco(blxAmount, amount, AddressZero);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }
            await getIbcoBalance();
            //Skip 28 days
            await increaseTime(IBCO_END);
            amountFromWhitelisted = await ibco.amountFromWhitelisted();
            //console.log('USD amount from whitelist investors: ', amountFromWhitelisted / 1e6);
            //Claim and refund
            //Investors in the whitelist can claim
            for (i = 1; i < 11; i++) {
                await ibco.connect(accounts[i]).claim();
                let balanceBlx = await blxToken.balanceOf(accounts[i].address);
                //console.log('Investor claimed: ', balanceBlx / 1e6, 'BLX');
                // claim include 200K from presale
                expect(balanceBlx / 1e6 - 200000).to.be.within(
                    amount / prices[i] - EPSILON,
                    amount / prices[i] + EPSILON
                );
            }
            await getIbcoBalance();
        });

        it('Refund is available after 28 days', async function () {
            let amount = 10000 * 1e6;

            await triggerPresaleSuccess();
            await startSale();

            for (let i = 0; i < accounts.length; i++) {
                let distributedBlx = await ibco.distributedBlx();
                let currentPrice = await ibco.currentPrice();
                const { _, blxToBuy, price: priceJs } = calcBlxAmount(+toUsdc(distributedBlx), +toUsdc(currentPrice), amount / 1e6);
                const { usdcNeeded, blxAmount, price18, i: round } = await ibco.calcBlxAmount(amount);
                await ibco.connect(accounts[i]).enterIbco(blxAmount, amount, AddressZero);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }
            await getIbcoBalance();
            //Skip 28 days
            await increaseTime(IBCO_END);
            amountFromWhitelisted = await ibco.amountFromWhitelisted();
            //console.log('USD amount from whitelist investors: ', amountFromWhitelisted / 1e6);
            //Anyone can refund if soft cap goals not met
            for (i = 1; i < 20; i++) {
                let balanceBefore = await usdToken.balanceOf(accounts[i].address);
                await ibco.connect(accounts[i]).refund();
                balanceAfter = await usdToken.balanceOf(accounts[i].address);
                //console.log('Investor refunded: ', (balanceAfter - balanceBefore) / 1e6, 'USDC');
                // purchase may not be exact amount
                expect(balanceAfter - balanceBefore).to.be.within(
                    amount - 2e6,
                    amount + 2e6
                );
            }
            amountFromWhitelisted = await blxPresale.amountFromWhitelisted();
            //console.log('USD amount from whitelist investors: ', amountFromWhitelisted / 1e6);
        });
        it('If sale ended admin can transfer all funds to DAO agent address', async function () {
            let amount = 100000 * 1e6;

            await triggerPresaleSuccess();
            await startSale();

            for (let i = 0; i < accounts.length; i++) {
                let distributedBlx = await ibco.distributedBlx();
                let currentPrice = await ibco.currentPrice();
                const { _, blxToBuy, price: priceJs } = calcBlxAmount(+toUsdc(distributedBlx), +toUsdc(currentPrice), amount / 1e6);
                const { usdcNeeded, blxAmount, price18, i: round } = await ibco.calcBlxAmount(amount);
                await ibco.connect(accounts[i]).enterIbco(blxAmount, amount, AddressZero);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }
            await getIbcoBalance();
            //Skip 28 days
            await increaseTime(IBCO_END);

            let agentBalanceBefore = await usdToken.balanceOf(daoAgent.address);
            let amountFromWhitelisted = await ibco.amountFromWhitelisted();
            //console.log('USD amount from whitelist investors: ', amountFromWhitelisted / 1e6);

            //console.log('Sending USDC to DAO agent address...');
            await ibco.transferToDaoAgent();

            agentBalanceAfter = await usdToken.balanceOf(daoAgent.address);
            expect(agentBalanceAfter).to.be.equal(agentBalanceBefore.add(amountFromWhitelisted));
            amountFromWhitelisted = await ibco.amountFromWhitelisted();
            //console.log('USD amount from whitelist investors: ', amountFromWhitelisted / 1e6);
        });
        it('Token sale ends if hard cap is reached', async function () {
            let amount = 500000 * 1e6;

            await triggerPresaleSuccess();
            await startSale();
            //For simplicity we assume that everyone is whitelisted
            //Prepare our whitelist
            const addresses = accounts.map(el => el.address);
            const goodGuys = addresses.slice(0, 20);

            let hardCapStatus = await ibco.hardCapReached();
            expect(hardCapStatus).to.be.equal(false);
            for (let i = 0; i < 20; i++) {
                let distributedBlx = await ibco.distributedBlx();
                let maxPurchase = await ibco.maxPurchase();
                if (maxPurchase.toNumber() < amount) amount = maxPurchase;
                //console.log(toUsdc(distributedBlx));
                let currentPrice = await ibco.currentPrice();
                const { _, blxToBuy, price: priceJs } = calcBlxAmount(+toUsdc(distributedBlx), +toUsdc(currentPrice), amount / 1e6);
                const { usdcNeeded, blxAmount, price18, i: round } = await ibco.calcBlxAmount(amount);
                await ibco.connect(accounts[i]).enterIbco(blxAmount, amount, AddressZero);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }
            hardCapStatus = await ibco.hardCapReached();
            await getIbcoBalance();
            amountFromWhitelisted = await ibco.amountFromWhitelisted();
            //console.log('USD amount from whitelist investors: ', amountFromWhitelisted / 1e6);
            await expect(ibco.connect(accounts[3]).enterIbco(1e6, 0, AddressZero)).to.be.revertedWith("IBCO:IBCO_CLOSED");
        })

        it('Referrer claim after burning unused(both pass softcap)', async function () {
            let amount = 200000 * 1e6;
            const referrer = accounts[0].address;

            await startPresale();
            // meet soft cap and 10% referral
            await blxPresale.connect(accounts[1]).enterPresale(amount, referrer);

            await increaseTime(PRESALE_END);

            let balanceBlx0 = await blxToken.balanceOf(accounts[0].address);
            //console.log('Investor has: ', balanceBlx0 / 1e6, 'BLX');

            // referrer claim(without any purchase)
            await blxPresale.connect(accounts[0]).claim();
            let balanceBlx1 = await blxToken.balanceOf(accounts[0].address);
            //console.log('Investor claimed: ', (balanceBlx1 - balanceBlx0) / 1e6, 'BLX');
            // 10% rewards
            expect(balanceBlx1).to.be.equal(balanceBlx0.add(amount));

            await startSale();

            let balanceBlx2 = await blxToken.balanceOf(accounts[0].address);

            for (let i = 1; i < 6; i++) {
                let distributedBlx = await ibco.distributedBlx();
                let maxPurchase = await ibco.maxPurchase();
                if (maxPurchase.toNumber() < amount) amount = maxPurchase;
                //console.log(toUsdc(distributedBlx));
                let currentPrice = await ibco.currentPrice();
                const { _, blxToBuy, price: priceJs } = calcBlxAmount(+toUsdc(distributedBlx), +toUsdc(currentPrice), amount / 1e6);
                let { usdcNeeded, blxAmount, price18, i: round } = await ibco.calcBlxAmount(amount);
                await ibco.connect(accounts[i]).enterIbco(blxAmount, amount, referrer);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }

            await increaseTime(IBCO_END);

            // burn unsold
            await ibco.burnUnsoldBLX();

            for (let i = 1; i < 6; i++) {
                // can still claim
                await ibco.connect(accounts[i]).claim();
            }
            // all claimed
            expect(await blxToken.balanceOf(ibco.address)).to.be.equal(0);
        })

        it('Referrer claim in two stages(both pass softcap)', async function () {
            let amount = 200000 * 1e6;
            const referrer = accounts[0].address;

            await startPresale();
            // meet soft cap and 10% referral
            await blxPresale.connect(accounts[1]).enterPresale(amount, referrer);

            await increaseTime(PRESALE_END);

            let balanceBlx0 = await blxToken.balanceOf(accounts[0].address);
            //console.log('Investor has: ', balanceBlx0 / 1e6, 'BLX');

            // referrer claim(without any purchase)
            await blxPresale.connect(accounts[0]).claim();
            let balanceBlx1 = await blxToken.balanceOf(accounts[0].address);
            //console.log('Investor claimed: ', (balanceBlx1 - balanceBlx0) / 1e6, 'BLX');
            // 10% rewards
            expect(balanceBlx1).to.be.equal(balanceBlx0.add(amount));

            await startSale();

            let balanceBlx2 = await blxToken.balanceOf(accounts[0].address);

            for (let i = 1; i < 6; i++) {
                let distributedBlx = await ibco.distributedBlx();
                let maxPurchase = await ibco.maxPurchase();
                if (maxPurchase.toNumber() < amount) amount = maxPurchase;
                //console.log(toUsdc(distributedBlx));
                let currentPrice = await ibco.currentPrice();
                const { _, blxToBuy, price: priceJs } = calcBlxAmount(+toUsdc(distributedBlx), +toUsdc(currentPrice), amount / 1e6);
                let { usdcNeeded, blxAmount, price18, i: round } = await ibco.calcBlxAmount(amount);
                await ibco.connect(accounts[i]).enterIbco(blxAmount, amount, referrer);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }

            await increaseTime(IBCO_END);

            const amountFromWhitelisted = await ibco.amountFromWhitelisted();
            //console.log('USD amount from whitelist investors: ', amountFromWhitelisted / 1e6);

            // purchased blx
            const distributedBlx = await ibco.distributedBlx();
            //console.log('Purchased BLX: ', (distributedBlx) / 1e6, 'BLX');

            // referrer claim(without any purchase)
            await ibco.connect(accounts[0]).claim();

            let balanceBlx3 = await blxToken.balanceOf(accounts[0].address);
            //console.log('Investor claimed: ', (balanceBlx3 - balanceBlx2) / 1e6, 'BLX');
            // 10% of ibco purchased
            expect(balanceBlx3).to.be.equal(balanceBlx2.add(distributedBlx / 10));

        })

        it('Referrer claim in ibco then presale(both pass softcap)', async function () {
            let amount = 200000 * 1e6;
            const referrer = accounts[0].address;

            let balanceBlx0 = await blxToken.balanceOf(accounts[0].address);
            //console.log('Investor has: ', balanceBlx0 / 1e6, 'BLX');
            await startPresale();
            // meet soft cap and 10% referral
            await blxPresale.connect(accounts[1]).enterPresale(amount, referrer);

            await increaseTime(PRESALE_END);

            await startSale();

            for (let i = 1; i < 6; i++) {
                let distributedBlx = await ibco.distributedBlx();
                let maxPurchase = await ibco.maxPurchase();
                if (maxPurchase.toNumber() < amount) amount = maxPurchase;
                //console.log(toUsdc(distributedBlx));
                let currentPrice = await ibco.currentPrice();
                const { _, blxToBuy, price: priceJs } = calcBlxAmount(+toUsdc(distributedBlx), +toUsdc(currentPrice), amount / 1e6);
                let { usdcNeeded, blxAmount, price18, i: round } = await ibco.calcBlxAmount(amount);
                await ibco.connect(accounts[i]).enterIbco(blxAmount, amount, referrer);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }

            await increaseTime(IBCO_END);

            const amountFromWhitelisted = await ibco.amountFromWhitelisted();
            //console.log('USD amount from whitelist investors: ', amountFromWhitelisted / 1e6);

            // purchased blx
            const distributedBlx = await ibco.distributedBlx();
            //console.log('Purchased BLX: ', (distributedBlx) / 1e6, 'BLX');

            let balanceBlx1 = await blxToken.balanceOf(accounts[0].address);

            // referrer claim(without any purchase)
            await ibco.connect(accounts[0]).claim();

            let balanceBlx2 = await blxToken.balanceOf(accounts[0].address);
            //console.log('Investor claimed: ', (balanceBlx2 - balanceBlx1) / 1e6, 'BLX');
            // 10% of ibco purchased + 10% of presale purchase
            expect(balanceBlx2).to.be.equal(balanceBlx1.add(distributedBlx / 10 + amount));

            // referrer claim(without any purchase), should revert
            await expect(blxPresale.connect(accounts[0]).claim())
                .to.be.revertedWith("PRESALE:NOTHING_TO_CLAIM");
        })

        it('Referrer claim in ibco then presale(ibco failed)', async function () {
            let amount = 200000 * 1e6;
            const referrer = accounts[1].address;

            let balanceBlx0 = await blxToken.balanceOf(accounts[0].address);
            //console.log('Investor has: ', balanceBlx0 / 1e6, 'BLX');
            await startPresale();
            // meet soft cap and 10% referral, self is ignored
            for (let i = 1; i < 3; i++) {
                await blxPresale.connect(accounts[i]).enterPresale(amount, referrer);
            }

            await increaseTime(PRESALE_END);

            await startSale();

            // ibco failed
            for (let i = 1; i < 4; i++) {
                let distributedBlx = await ibco.distributedBlx();
                let maxPurchase = await ibco.maxPurchase();
                if (maxPurchase.toNumber() < amount) amount = maxPurchase;
                //console.log(toUsdc(distributedBlx));
                let currentPrice = await ibco.currentPrice();
                const { _, blxToBuy, price: priceJs } = calcBlxAmount(+toUsdc(distributedBlx), +toUsdc(currentPrice), amount / 1e6);
                let { usdcNeeded, blxAmount, price18, i: round } = await ibco.calcBlxAmount(amount);
                await ibco.connect(accounts[i]).enterIbco(blxAmount, amount, referrer);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }

            await increaseTime(IBCO_END);

            const amountFromWhitelisted = await ibco.amountFromWhitelisted();
            //console.log('USD amount from whitelist investors: ', amountFromWhitelisted / 1e6);

            // purchased blx
            const distributedBlx = await ibco.distributedBlx();
            //console.log('Purchased BLX: ', (distributedBlx) / 1e6, 'BLX');

            let balanceBlx1 = await blxToken.balanceOf(accounts[1].address);

            // referrer claim(with purchase), should revert in ibco
            await expect(ibco.connect(accounts[1]).claim())
                .to.be.revertedWith("IBCO:TOTAL_AMOUNT_BELOW_SOFT_CAP");

            // referrer claim via presale(with purchase)
            await blxPresale.connect(accounts[1]).claim();

            let balanceBlx2 = await blxToken.balanceOf(accounts[1].address);
            //console.log('Investor claimed: ', (balanceBlx2 - balanceBlx1) / 1e6, 'BLX');
            // 10% of presale referral purchased + self purchase
            expect(balanceBlx2).to.be.equal(balanceBlx1.add(amount + amount * 10));

            // refund ibco purchase
            for (let i = 1; i < 4; i++) {
                await ibco.connect(accounts[i]).refund();
            }
        })

        it('Referrer claim in ibco then presale(presale failed)', async function () {
            let amount = 100000 * 1e6;
            const referrer = accounts[1].address;

            let balanceBlx0 = await blxToken.balanceOf(accounts[0].address);
            //console.log('Investor has: ', balanceBlx0 / 1e6, 'BLX');
            await startPresale();
            // soft cap failed
            for (let i = 1; i < 3; i++) {
                await blxPresale.connect(accounts[i]).enterPresale(40000 * 1e6, referrer);
            }

            await increaseTime(PRESALE_END);

            await startSale();

            // ibco success
            for (let i = 1; i < 11; i++) {
                let distributedBlx = await ibco.distributedBlx();
                let maxPurchase = await ibco.maxPurchase();
                if (maxPurchase.toNumber() < amount) amount = maxPurchase;
                //console.log(toUsdc(distributedBlx));
                let currentPrice = await ibco.currentPrice();
                const { _, blxToBuy, price: priceJs } = calcBlxAmount(+toUsdc(distributedBlx), +toUsdc(currentPrice), amount / 1e6);
                let { usdcNeeded, blxAmount, price18, i: round } = await ibco.calcBlxAmount(amount);
                await ibco.connect(accounts[i]).enterIbco(blxAmount, amount, referrer);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }

            await increaseTime(IBCO_END);

            const amountFromWhitelisted = await ibco.amountFromWhitelisted();
            //console.log('USD amount from whitelist investors: ', amountFromWhitelisted / 1e6);

            // purchased blx
            const distributedBlx = await ibco.distributedBlx();
            //console.log('Purchased BLX: ', (distributedBlx) / 1e6, 'BLX');

            let balanceBlx1 = await blxToken.balanceOf(accounts[1].address);

            // referrer claim(with purchase)
            const { amountToClaim } = await ibco.collaterals(accounts[1].address);
            //console.log('Purchased BLX: ', (amountToClaim) / 1e6, 'BLX');
            // referrer claim via ibco(with purchase)
            await ibco.connect(accounts[1]).claim();

            // referrer claim via presale(for referral reward), should fail as it is claimed via ibco
            await expect(blxPresale.connect(accounts[1]).claim())
                .to.be.revertedWith("PRESALE:NOTHING_TO_CLAIM");

            let balanceBlx2 = await blxToken.balanceOf(accounts[1].address);
            //console.log('Investor claimed: ', (balanceBlx2 - balanceBlx1) / 1e6, 'BLX');
            // 10% of presale referral purchased(ignore self) + self purchase
            expect(balanceBlx1.add(amountToClaim.add(distributedBlx.sub(amountToClaim).div(10)))).to.be.within(
                balanceBlx2 - 1e6,
                balanceBlx2 + 1e6
            );

            // refund presale purchase
            for (let i = 1; i < 3; i++) {
                await blxPresale.connect(accounts[i]).refund(accounts[i].address);
            }
        })
        it('Referrer claim in presale then ibco(presale failed but with ibco reward)', async function () {
            let amount = 100000 * 1e6;
            const referrer = accounts[1].address;

            let balanceBlx0 = await blxToken.balanceOf(accounts[0].address);
            //console.log('Investor has: ', balanceBlx0 / 1e6, 'BLX');
            await startPresale();
            // soft cap failed
            for (let i = 1; i < 3; i++) {
                await blxPresale.connect(accounts[i]).enterPresale(40000 * 1e6, referrer);
            }

            await increaseTime(PRESALE_END);

            await startSale();

            // ibco success
            for (let i = 1; i < 11; i++) {
                let distributedBlx = await ibco.distributedBlx();
                let maxPurchase = await ibco.maxPurchase();
                if (maxPurchase.toNumber() < amount) amount = maxPurchase;
                //console.log(toUsdc(distributedBlx));
                let currentPrice = await ibco.currentPrice();
                const { _, blxToBuy, price: priceJs } = calcBlxAmount(+toUsdc(distributedBlx), +toUsdc(currentPrice), amount / 1e6);
                let { usdcNeeded, blxAmount, price18, i: round } = await ibco.calcBlxAmount(amount);
                await ibco.connect(accounts[i]).enterIbco(blxAmount, amount, referrer);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }

            await increaseTime(IBCO_END);

            const amountFromWhitelisted = await ibco.amountFromWhitelisted();
            //console.log('USD amount from whitelist investors: ', amountFromWhitelisted / 1e6);

            // purchased blx
            const distributedBlx = await ibco.distributedBlx();
            //console.log('Purchased BLX: ', (distributedBlx) / 1e6, 'BLX');

            let balanceBlx1 = await blxToken.balanceOf(accounts[1].address);

            const { amountToClaim } = await ibco.collaterals(accounts[1].address);
            //console.log('Purchased BLX: ', (amountToClaim) / 1e6, 'BLX');

            // referrer claim via presale(for referral reward but no presale BLX)
            await blxPresale.connect(accounts[1]).claim();

            for (let i = 1; i < 11; i++) {
                // referrer claim via ibco(with purchase) some don't have rewards
                await ibco.connect(accounts[i]).claim();
            }

            let balanceBlx2 = await blxToken.balanceOf(accounts[1].address);
            //console.log('Investor claimed: ', (balanceBlx2 - balanceBlx1) / 1e6, 'BLX');
            // 10% of presale referral purchased(ignore self) + self purchase
            expect(balanceBlx1.add(amountToClaim.add(distributedBlx.sub(amountToClaim).div(10)))).to.be.within(
                balanceBlx2 - 1e6,
                balanceBlx2 + 1e6
            );

            // refund presale purchase
            for (let i = 1; i < 3; i++) {
                await blxPresale.connect(accounts[i]).refund(accounts[i].address);
            }
        })
        it('Referrer claim in presale then ibco(both failed but with calculated rewards which is not claimable)', async function () {
            let amount = 100000 * 1e6;
            const referrer = accounts[1].address;

            let balanceBlx0 = await blxToken.balanceOf(accounts[0].address);
            //console.log('Investor has: ', balanceBlx0 / 1e6, 'BLX');
            await startPresale();
            // soft cap failed
            for (let i = 1; i < 3; i++) {
                await blxPresale.connect(accounts[i]).enterPresale(40000 * 1e6, referrer);
            }

            await increaseTime(PRESALE_END);

            await startSale();

            // ibco failed
            for (let i = 1; i < 9; i++) {
                let distributedBlx = await ibco.distributedBlx();
                let maxPurchase = await ibco.maxPurchase();
                if (maxPurchase.toNumber() < amount) amount = maxPurchase;
                //console.log(toUsdc(distributedBlx));
                let currentPrice = await ibco.currentPrice();
                const { _, blxToBuy, price: priceJs } = calcBlxAmount(+toUsdc(distributedBlx), +toUsdc(currentPrice), amount / 1e6);
                let { usdcNeeded, blxAmount, price18, i: round } = await ibco.calcBlxAmount(amount);
                await ibco.connect(accounts[i]).enterIbco(blxAmount, amount, referrer);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }

            await increaseTime(IBCO_END);

            const amountFromWhitelisted = await ibco.amountFromWhitelisted();
            //console.log('USD amount from whitelist investors: ', amountFromWhitelisted / 1e6);

            // purchased blx
            const distributedBlx = await ibco.distributedBlx();
            //console.log('Purchased BLX: ', (distributedBlx) / 1e6, 'BLX');

            let balanceBlx1 = await blxToken.balanceOf(accounts[1].address);

            const { amountToClaim } = await ibco.collaterals(accounts[1].address);
            //console.log('Purchased BLX: ', (amountToClaim) / 1e6, 'BLX');

            // referrer claim via presale(for referral reward but no presale BLX)
            // refund presale purchase
            for (let i = 1; i < 3; i++) {
                await expect(blxPresale.connect(accounts[i]).claim())
                    .to.be.revertedWith("PRESALE:NOTHING_TO_CLAIM");
            }

            for (let i = 1; i < 11; i++) {
                // referrer claim via ibco(with purchase) some don't have rewards
                await expect(ibco.connect(accounts[i]).claim())
                    .to.be.revertedWith("IBCO:TOTAL_AMOUNT_BELOW_SOFT_CAP");
            }

            // refund presale purchase
            for (let i = 1; i < 3; i++) {
                await blxPresale.connect(accounts[i]).refund(accounts[i].address);
            }

            // refund ibco purchase
            for (let i = 1; i < 11; i++) {
                await ibco.connect(accounts[i]).refund();
            }
        })
        it('Referrer claim in ibco then presale(both failed but with calculated rewards which is not claimable)', async function () {
            let amount = 100000 * 1e6;
            const referrer = accounts[1].address;

            let balanceBlx0 = await blxToken.balanceOf(accounts[0].address);
            //console.log('Investor has: ', balanceBlx0 / 1e6, 'BLX');
            await startPresale();
            // soft cap failed
            for (let i = 1; i < 3; i++) {
                await blxPresale.connect(accounts[i]).enterPresale(40000 * 1e6, referrer);
            }

            await increaseTime(PRESALE_END);

            await startSale();

            // ibco failed
            for (let i = 1; i < 9; i++) {
                let distributedBlx = await ibco.distributedBlx();
                let maxPurchase = await ibco.maxPurchase();
                if (maxPurchase.toNumber() < amount) amount = maxPurchase;
                //console.log(toUsdc(distributedBlx));
                let currentPrice = await ibco.currentPrice();
                const { _, blxToBuy, price: priceJs } = calcBlxAmount(+toUsdc(distributedBlx), +toUsdc(currentPrice), amount / 1e6);
                let { usdcNeeded, blxAmount, price18, i: round } = await ibco.calcBlxAmount(amount);
                await ibco.connect(accounts[i]).enterIbco(blxAmount, amount, referrer);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }

            await increaseTime(IBCO_END);

            const amountFromWhitelisted = await ibco.amountFromWhitelisted();
            //console.log('USD amount from whitelist investors: ', amountFromWhitelisted / 1e6);

            // purchased blx
            const distributedBlx = await ibco.distributedBlx();
            //console.log('Purchased BLX: ', (distributedBlx) / 1e6, 'BLX');

            let balanceBlx1 = await blxToken.balanceOf(accounts[1].address);

            const { amountToClaim } = await ibco.collaterals(accounts[1].address);
            //console.log('Purchased BLX: ', (amountToClaim) / 1e6, 'BLX');

            for (let i = 1; i < 11; i++) {
                // referrer claim via ibco(with purchase) some don't have rewards
                await expect(ibco.connect(accounts[i]).claim())
                    .to.be.revertedWith("IBCO:TOTAL_AMOUNT_BELOW_SOFT_CAP");
            }

            // referrer claim via presale(for referral reward but no presale BLX)
            for (let i = 1; i < 3; i++) {
                await expect(blxPresale.connect(accounts[i]).claim())
                    .to.be.revertedWith("PRESALE:NOTHING_TO_CLAIM");
            }

            // refund ibco purchase
            for (let i = 1; i < 11; i++) {
                await ibco.connect(accounts[i]).refund();
            }

            // refund presale purchase(should fail as it is included as part of ibco refund)
            for (let i = 1; i < 3; i++) {
                await expect(blxPresale.connect(accounts[i]).refund(accounts[i].address))
                    .to.be.revertedWith("PRESALE:ALREADY_REFUNDED");
            }
        })
        it('Purchase via forwarder(gasless tx)', async function () {
            let amount = 200000 * 1e6;

            await triggerPresaleSuccess();
            await startSale();

            const referrer = accounts[1].address;
            //console.log(`referrer ${referrer}`);
            for (let i = 1; i < 15; i++) {
                // 14 purchase
                let distributedBlx = await ibco.distributedBlx();
                let maxPurchase = await ibco.maxPurchase();
                if (maxPurchase.toNumber() < amount) amount = maxPurchase;
                //console.log(toUsdc(distributedBlx));
                let currentPrice = await ibco.currentPrice();
                const { _, blxToBuy, price: priceJs } = calcBlxAmount(+toUsdc(distributedBlx), +toUsdc(currentPrice), amount / 1e6);
                let { usdcNeeded, blxAmount, price18, i: round } = await ibco.calcBlxAmount(amount);
                await ibco.connect(accounts[i]).enterIbco(blxAmount, amount, AddressZero);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }
            const txCost = await ibco.txCost();

            for (let i = 16; i < 17; i++) {
                let distributedBlx = await ibco.distributedBlx();
                let maxPurchase = await ibco.maxPurchase();
                if (maxPurchase.toNumber() < amount) amount = maxPurchase;
                //console.log(toUsdc(distributedBlx));
                let currentPrice = await ibco.currentPrice();
                const { _, blxToBuy, price: priceJs } = calcBlxAmount(+toUsdc(distributedBlx), +toUsdc(currentPrice), amount / 1e6);
                let { usdcNeeded, blxAmount, price18, i: round } = await ibco.calcBlxAmount(amount);
                
                const balance0 = await usdToken.balanceOf(accounts[i].address);
                const txData = (await tokenSale.populateTransaction["enterIbco"](blxAmount, amount, AddressZero,"0x","0x")).data;
                await forwarder.connect(accounts[0]).execute(accounts[i].address, tokenSale.address, txData, 400000);
                const balance1 = await usdToken.balanceOf(accounts[i].address);
                expect(balance0.sub(amount).sub(txCost)).to.be.equal(balance1);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }
            //Skip 28 days
            await increaseTime(IBCO_END);
            const balance0 = await usdToken.balanceOf(presaleDaoAgent.address);
            await ibco.transferToDaoAgent();

            // receive tx cost for presaleDaoAgent(not daoagent of ibco)
            expect((balance0).add(txCost.mul(1))).to.be.equal(await usdToken.balanceOf(presaleDaoAgent.address));

        });

        it('Purchase via forwarder(gasless tx), softcap not match refund but keep tx fee', async function () {
            let amount = 200000 * 1e6;

            await triggerPresaleSuccess();
            await startSale();

            const referrer = accounts[1].address;
            //console.log(`referrer ${referrer}`);
            for (let i = 1; i < 3; i++) {
                // 14 purchase
                let distributedBlx = await ibco.distributedBlx();
                let maxPurchase = await ibco.maxPurchase();
                if (maxPurchase.toNumber() < amount) amount = maxPurchase;
                //console.log(toUsdc(distributedBlx));
                let currentPrice = await ibco.currentPrice();
                const { _, blxToBuy, price: priceJs } = calcBlxAmount(+toUsdc(distributedBlx), +toUsdc(currentPrice), amount / 1e6);
                let { usdcNeeded, blxAmount, price18, i: round } = await ibco.calcBlxAmount(amount);
                await ibco.connect(accounts[i]).enterIbco(blxAmount, amount, AddressZero);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }
            const txCost = await ibco.txCost();

            for (let i = 4; i < 6; i++) {
                let distributedBlx = await ibco.distributedBlx();
                let maxPurchase = await ibco.maxPurchase();
                if (maxPurchase.toNumber() < amount) amount = maxPurchase;
                //console.log(toUsdc(distributedBlx));
                let currentPrice = await ibco.currentPrice();
                const { _, blxToBuy, price: priceJs } = calcBlxAmount(+toUsdc(distributedBlx), +toUsdc(currentPrice), amount / 1e6);
                let { usdcNeeded, blxAmount, price18, i: round } = await ibco.calcBlxAmount(amount);
                
                const balance0 = await usdToken.balanceOf(accounts[i].address);
                const txData = (await tokenSale.populateTransaction["enterIbco"](blxAmount, amount, AddressZero,"0x","0x")).data;
                await forwarder.connect(accounts[0]).execute(accounts[i].address, tokenSale.address, txData, 400000);
                const balance1 = await usdToken.balanceOf(accounts[i].address);
                expect(balance0.sub(amount).sub(txCost)).to.be.equal(balance1);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }

            //Skip 28 days
            await increaseTime(IBCO_END);
            const balance0 = await usdToken.balanceOf(presaleDaoAgent.address);
            
            await ibco.transferTxFee();

            // receive tx cost for presaleDaoAgent(not daoagent of ibco)
            expect((balance0).add(txCost.mul(2))).to.be.equal(await usdToken.balanceOf(presaleDaoAgent.address));

            for (let i = 1; i < 6; i++) {
                await ibco.connect(accounts[i]).refund();
            }
        });

        it('Purchase via forwarder(gasless tx), extract tx fee in between', async function () {
            let amount = 200000 * 1e6;

            await triggerPresaleSuccess();
            await startSale();

            const referrer = accounts[1].address;
            const txCost = await ibco.txCost();

            for (let i = 1; i < 10; i++) {
                let distributedBlx = await ibco.distributedBlx();
                let maxPurchase = await ibco.maxPurchase();
                if (maxPurchase.toNumber() < amount) amount = maxPurchase;
                //console.log(toUsdc(distributedBlx));
                let currentPrice = await ibco.currentPrice();
                const { _, blxToBuy, price: priceJs } = calcBlxAmount(+toUsdc(distributedBlx), +toUsdc(currentPrice), amount / 1e6);
                let { usdcNeeded, blxAmount, price18, i: round } = await ibco.calcBlxAmount(amount);
                
                const balance0 = await usdToken.balanceOf(accounts[i].address);
                const txData = (await tokenSale.populateTransaction["enterIbco"](blxAmount, amount, AddressZero,"0x","0x")).data;
                await forwarder.connect(accounts[0]).execute(accounts[i].address, tokenSale.address, txData, 400000);
                const balance1 = await usdToken.balanceOf(accounts[i].address);
                expect(balance0.sub(amount).sub(txCost)).to.be.equal(balance1);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
                await ibco.transferTxFee();
            }
        });

        it('Purchase via forwarder(gasless tx), softcap not match refund but keep tx fee(via first refund)', async function () {
            let amount = 200000 * 1e6;

            await triggerPresaleSuccess();
            await startSale();

            const referrer = accounts[1].address;
            //console.log(`referrer ${referrer}`);
            for (let i = 1; i < 3; i++) {
                // 14 purchase
                let distributedBlx = await ibco.distributedBlx();
                let maxPurchase = await ibco.maxPurchase();
                if (maxPurchase.toNumber() < amount) amount = maxPurchase;
                //console.log(toUsdc(distributedBlx));
                let currentPrice = await ibco.currentPrice();
                const { _, blxToBuy, price: priceJs } = calcBlxAmount(+toUsdc(distributedBlx), +toUsdc(currentPrice), amount / 1e6);
                let { usdcNeeded, blxAmount, price18, i: round } = await ibco.calcBlxAmount(amount);
                await ibco.connect(accounts[i]).enterIbco(blxAmount, amount, AddressZero);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }
            const txCost = await ibco.txCost();

            for (let i = 4; i < 6; i++) {
                let distributedBlx = await ibco.distributedBlx();
                let maxPurchase = await ibco.maxPurchase();
                if (maxPurchase.toNumber() < amount) amount = maxPurchase;
                //console.log(toUsdc(distributedBlx));
                let currentPrice = await ibco.currentPrice();
                const { _, blxToBuy, price: priceJs } = calcBlxAmount(+toUsdc(distributedBlx), +toUsdc(currentPrice), amount / 1e6);
                let { usdcNeeded, blxAmount, price18, i: round } = await ibco.calcBlxAmount(amount);
                
                const balance0 = await usdToken.balanceOf(accounts[i].address);
                const txData = (await tokenSale.populateTransaction["enterIbco"](blxAmount, amount, AddressZero,"0x","0x")).data;
                await forwarder.connect(accounts[0]).execute(accounts[i].address, tokenSale.address, txData, 400000);
                const balance1 = await usdToken.balanceOf(accounts[i].address);
                expect(balance0.sub(amount).sub(txCost)).to.be.equal(balance1);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }

            //Skip 28 days
            await increaseTime(IBCO_END);
            const balance0 = await usdToken.balanceOf(presaleDaoAgent.address);
            

            for (let i = 1; i < 6; i++) {
                await ibco.connect(accounts[i]).refund();
            }
            // receive tx cost for presaleDaoAgent(not daoagent of ibco)
            expect((balance0).add(txCost.mul(2))).to.be.equal(await usdToken.balanceOf(presaleDaoAgent.address));
        });
        it('can partial refund presale(softcap not reach) and not ibco(softcap reach)', async function () {
            let amount = 200000 * 1e6;
            
            const referrer = accounts[1].address;
            await startPresale();
            // soft cap failed
            for (let i = 1; i < 3; i++) {
                await blxPresale.connect(accounts[i]).enterPresale(1000 * 1e6, referrer);
            }

            await increaseTime(PRESALE_END);

            await startSale();

            //console.log(`referrer ${referrer}`);
            for (let i = 1; i < 6; i++) {
                // 14 purchase
                let distributedBlx = await ibco.distributedBlx();
                let maxPurchase = await ibco.maxPurchase();
                if (maxPurchase.toNumber() < amount) amount = maxPurchase;
                //console.log(toUsdc(distributedBlx));
                let currentPrice = await ibco.currentPrice();
                const { _, blxToBuy, price: priceJs } = calcBlxAmount(+toUsdc(distributedBlx), +toUsdc(currentPrice), amount / 1e6);
                let { usdcNeeded, blxAmount, price18, i: round } = await ibco.calcBlxAmount(amount);
                await ibco.connect(accounts[i]).enterIbco(blxAmount, amount, AddressZero);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }

            //Skip 28 days
            await increaseTime(IBCO_END);
            
            // first refund pass(from presale)
            for (let i = 1; i < 3; i++) {
                const balance0 = await usdToken.balanceOf(accounts[i].address);
                await ibco.connect(accounts[i]).refund();
                expect((balance0).add(1000 * 1e6)).to.be.equal(await usdToken.balanceOf(accounts[i].address));
            }
            // second refund fail(already refund for presale)
            for (let i = 1; i < 3; i++) {
                await expect(ibco.connect(accounts[i]).refund())
                .to.be.revertedWith("IBCO:PLEASE_CLAIM_YOUR_BLX_TOKENS");
            }
        });
    })

    describe("Negative tests", async () => {
        it("Can't call purchase except tokensale contract", async function () {

            await triggerPresaleSuccess();
            await startSale();

            await expect(ibco.connect(accounts[0]).purchase(10 * 1e6, 1e6, AddressZero, accounts[1].address, false))
                .to.be.revertedWith("IBCO:ONLY_FROM_TOKENSALE");
        });

        it("Can't config twice", async function () {

            const config = ibco.config(
                blxPresale.address,
                daoAgent.address,
                dao.address,
                IBCO_END,
                SOFT_CAP,
                HARD_CAP,
                Math.round(Date.now() / 1000)
            );

            await expect(config)
                .to.be.revertedWith("Initializable: contract is already initialized");
        });

        it("Can't start twice", async function () {
            let amount = 500000 * 1e6;

            await triggerPresaleSuccess();
            await startSale();
            await expect(startSale())
                .to.be.revertedWith("IBCO:ALREADY_STARTED");
        });

        it("Can't start without enough BLX deposit", async function () {
            // just short by 1
            await blxToken.transfer(blxPresale.address, 10000000 * 1e6 + 1000000 * 1e6 - 1);
            await expect(blxPresale.start())
                .to.be.revertedWith("PRESALE:NEED_BLX");
            await blxToken.transfer(blxPresale.address, 1);
            // enough for presale
            await blxPresale.start();

            // short by 1 for ibco
            await blxToken.transfer(ibco.address, 30000000 * 1e6 - 1);
            await expect(ibco.start())
                .to.be.revertedWith("IBCO:NEED_BLX");
            
            // used up all presale
            await blxPresale.connect(accounts[1]).enterPresale(HARD_CAP_PRESALE, AddressZero);

            // enough for ibco but not rewards
            await blxToken.transfer(ibco.address, 1);
            await expect(ibco.start())
                .to.be.revertedWith("IBCO:NEED_REWARD_BLX");

            // short by 1 for max potential reward     
            await blxToken.transfer(blxPresale.address, 3000000 * 1e6 - 1);
            await expect(ibco.start())
                .to.be.revertedWith("IBCO:NEED_REWARD_BLX");
            
        });

        it("Can't claim or refund same investment twice", async function () {
            let amount = 500000 * 1e6;

            await triggerPresaleSuccess();
            await startSale();

            for (let i = 0; i < accounts.length; i++) {
                let distributedBlx = await ibco.distributedBlx();
                let maxPurchase = await ibco.maxPurchase();
                if (maxPurchase.toNumber() < amount) amount = maxPurchase;
                //console.log(toUsdc(distributedBlx));
                let currentPrice = await ibco.currentPrice();
                const { _, blxToBuy, price: priceJs } = calcBlxAmount(+toUsdc(distributedBlx), +toUsdc(currentPrice), amount / 1e6);
                const { usdcNeeded, blxAmount, price18, i: round } = await ibco.calcBlxAmount(amount);
                await ibco.connect(accounts[i]).enterIbco(blxAmount, amount, AddressZero);
                ////console.log(`Investor sent ${amount/1e6} USDC`);
            }
            await getIbcoBalance();
            amountFromWhitelisted = await ibco.amountFromWhitelisted();
            //console.log('USD amount from whitelist investors: ', amountFromWhitelisted / 1e6);
            //Skip 28 days
            await increaseTime(IBCO_END);
            //Claim and refund
            //Can't claim or refund twice in a row
            for (i = 1; i < 11; i++) {
                await ibco.connect(accounts[i]).claim();
                await expect(ibco.connect(accounts[i]).claim())
                    .to.be.revertedWith("IBCO:ALREADY_CLAIMED");
            }
        });
        it("Can't claim or refund during sale (28 days not passed, soft cap not reached in case of claim)", async function () {
            let amount = 50000 * 1e6;

            await triggerPresaleSuccess();
            await startSale();

            for (let i = 0; i < 19; i++) {
                let distributedBlx = await ibco.distributedBlx();
                let maxPurchase = await ibco.maxPurchase();
                if (maxPurchase.toNumber() < amount) amount = maxPurchase;
                //console.log(toUsdc(distributedBlx));
                let currentPrice = await ibco.currentPrice();
                const { _, blxToBuy, price: priceJs } = calcBlxAmount(+toUsdc(distributedBlx), +toUsdc(currentPrice), amount / 1e6);
                const { usdcNeeded, blxAmount, price18, i: round } = await ibco.calcBlxAmount(amount);
                await ibco.connect(accounts[i]).enterIbco(blxAmount, amount, AddressZero);
                ////console.log(`Investor sent ${amount/1e6} USDC`);
            }
            await getIbcoBalance();
            amountFromWhitelisted = await ibco.amountFromWhitelisted();
            //console.log('USD amount from whitelist investors: ', amountFromWhitelisted / 1e6);
            //Claim and refund
            //Can't claim or refund during sale
            for (i = 1; i < 11; i++) {
                await expect(ibco.connect(accounts[i]).claim())
                    .to.be.revertedWith("IBCO:SALE_IN_PROGRESS");
            }
            for (i = 11; i < 19; i++) {
                await expect(ibco.connect(accounts[i]).refund())
                    .to.be.revertedWith("IBCO:SALE_IN_PROGRESS");
            }
            //Skip 28 days and try again with claim, soft cap not reached though
            await increaseTime(IBCO_END);
            for (i = 1; i < 11; i++) {
                await expect(ibco.connect(accounts[i]).claim())
                    .to.be.revertedWith("IBCO:TOTAL_AMOUNT_BELOW_SOFT_CAP");
            }
        });
        it.skip("Can't start IBCO if presale hasn't reached it's soft cap", async function () {
            let amount = 20000 * 1e6;
            await expect(startSale())
                .to.be.revertedWith("IBCO:PRESALE_SOFT_CAP_NOT_REACHED");
        });
        it("Can't commit after sale has ended", async function () {
            let amount = 20000 * 1e6;

            await triggerPresaleSuccess();
            await startSale();
            //Skip 28 days
            await increaseTime(IBCO_END);
            for (let i = 1; i < accounts.length; i++) {
                let distributedBlx = await ibco.distributedBlx();
                let maxPurchase = await ibco.maxPurchase();
                if (maxPurchase.toNumber() < amount) amount = maxPurchase;
                //console.log(toUsdc(distributedBlx));
                let currentPrice = await ibco.currentPrice();
                const { _, blxToBuy, price: priceJs } = calcBlxAmount(+toUsdc(distributedBlx), +toUsdc(currentPrice), amount / 1e6);
                const { usdcNeeded, blxAmount, price18, i: round } = await ibco.calcBlxAmount(amount);
                await expect(ibco.connect(accounts[i]).enterIbco(blxAmount, amount, AddressZero))
                    .to.be.revertedWith("IBCO:IBCO_CLOSED");
            }
        });
        it("Only admin can call admin functions", async function () {
            let amount = 20000 * 1e6;
            await expect(ibco.connect(accounts[1]).start())
                .to.be.revertedWith("AC:ADDRESS_IS_NOT_TRUSTED");
            await expect(blxPresale.connect(accounts[1]).setTxCost(1))
                .to.be.revertedWith("AC:ADDRESS_IS_NOT_TRUSTED");
            await expect(ibco.connect(accounts[1]).setMinAmount(10000))
                .to.be.revertedWith("AC:ADDRESS_IS_NOT_TRUSTED");
                await expect(ibco.connect(accounts[1]).returnBLX())
                .to.be.revertedWith("AC:ADDRESS_IS_NOT_TRUSTED");
            //Skip 28 days
            await increaseTime(IBCO_END);
            await expect(ibco.connect(accounts[1]).transferToDaoAgent())
                .to.be.revertedWith("AC:ADDRESS_IS_NOT_TRUSTED");
        });

        it('cannot return BLX once started', async function () {
            let amount = 20000 * 1e6;
            await startSale();

            //return BLX(should fail)
            await expect(ibco.returnBLX())
                .to.be.revertedWith("IBCO:ALREADY_START");

        });

        it("can't refund if both presale and ibco goest through", async function () {
            let amount = 200000 * 1e6;

            await triggerPresaleSuccess();
            await startSale();

            const referrer = accounts[1].address;
            //console.log(`referrer ${referrer}`);
            for (let i = 1; i < 6; i++) {
                // 14 purchase
                let distributedBlx = await ibco.distributedBlx();
                let maxPurchase = await ibco.maxPurchase();
                if (maxPurchase.toNumber() < amount) amount = maxPurchase;
                //console.log(toUsdc(distributedBlx));
                let currentPrice = await ibco.currentPrice();
                const { _, blxToBuy, price: priceJs } = calcBlxAmount(+toUsdc(distributedBlx), +toUsdc(currentPrice), amount / 1e6);
                let { usdcNeeded, blxAmount, price18, i: round } = await ibco.calcBlxAmount(amount);
                await ibco.connect(accounts[i]).enterIbco(blxAmount, amount, AddressZero);
                //console.log(`Investor sent ${amount / 1e6} USDC`);
            }

            //Skip 28 days
            await increaseTime(IBCO_END);

            await expect(ibco.connect(accounts[1]).refund())
                .to.be.revertedWith("IBCO:PLEASE_CLAIM_YOUR_BLX_TOKENS");

        });
    });
});
