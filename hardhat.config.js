require("dotenv").config();
require("@nomiclabs/hardhat-waffle");
//require("hardhat-gas-reporter");
require('hardhat-contract-sizer');
require('solidity-coverage');
require('@typechain/hardhat');
require("@nomiclabs/hardhat-etherscan");
const fs = require("fs");
const path = require("path");
const { task, types, extendEnvironment } = require("hardhat/config");
require("@nomiclabs/hardhat-ethers");

const { deployAndSetupContracts } = require("./utils/deploy");

const usdcAddresses = {
  mainnet: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
};
const blxPriceAddresses = {
  mainnet: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
};

const { ETHERSCAN_APIKEY, GOERLI_WALLET, MAINNET_WALLET, INFURA_KEY } = process.env;

const openzeppelinProxy = (network) => {
  console.log(`get proxies on ${network}`);

  if (network === "hardhat") {
    return {
      "ContractClassName": "0x", // 0x means no prior proxy
    }
  }
  else if (network === "dev") {
    return {
    }
  }
  else {
    return {
    }
  }
};

const getContractFactory = (
  env
) => env.ethers.getContractFactory;

extendEnvironment(env => {
  env.deployOptionBlitz = async (
    deployer,
    l1 = false,
    usdcAddress = undefined,
    blxAddress = undefined,
    blxPriceAddress = undefined,
    overrides
  ) => {
    const deployment = await deployAndSetupContracts(
      deployer,
      getContractFactory(env),
      l1,
      usdcAddress,
      blxAddress,
      blxPriceAddress,
      overrides
    );

    return { ...deployment };
  };
});

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

// deployment task
task("deploy", "Deploys the contracts to the network")
  .addOptionalParam("gasPrice", "Price to pay for 1 gas [Gwei]", undefined, types.float)
  .addOptionalParam("usdcAddress", "usdc address", undefined, types.string)
  .addOptionalParam("blxAddress", "blx address", undefined, types.string)
  .addOptionalParam("blxPriceAddress", "blx/usd price oracle address", undefined, types.string)
  .setAction(
    async ({ gasPrice, usdcAddress, blxAddress, blxPriceAddress }, env) => {
      const l1 = true;
      const overrides = { gasPrice: gasPrice && Decimal.from(gasPrice).div(1000000000).hex };
      const [deployer] = await env.ethers.getSigners();
      const deployment = { ...await env.deployOptionBlitz(deployer, l1, usdcAddress, blxAddress, blxPriceAddress, overrides), network: env.network.name };
      const channel = "default";

      fs.mkdirSync(path.join("deployments", channel), { recursive: true });

      fs.writeFileSync(
        path.join("deployments", channel, `${env.network.name}${l1 ? "L1" : ""}.json`),
        JSON.stringify(deployment, undefined, 2)
      );

      console.log('deploy contracts', deployment);
      // console.log('verifying ')
      // if (env.network.name  === 'goerli'  && l1) {
      //   const { BlxPresale, IBCO, TokenSale, USDC, Forwarder  } = deployment.addresses;
      //   await hre.run("verify:verify", {
      //       address: TokenSale,
      //       contract: "contracts/sale/TokenSale.sol:TokenSale",
      //       constructorArguments: [
      //         Forwarder,
      //         USDC,
      //       ],
      //     });
      // }
    }
  );

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */

// PRIVATE_KEY = process.env.<INSERT_YOUR_PRIVATE_KEY>;

module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.7.6",
        settings: {
          evmVersion: "istanbul",
          optimizer: {
            enabled: true,
            runs: 200
          }
        }
      },
      {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          }
        }
      },
      {
        version: "0.8.16",
        settings: {
//          viaIR: false,
          optimizer: {
            enabled: true,
            runs: 1000000,
            details: {
              yul: true,
              yulDetails: {
               stackAllocation: true,
//               optimizerSteps: "dhfoDgvulfnTUtnIf"
              }
            }
          },
        },
      }
    ],
    overrides: {
      "contracts/LinkToken.sol": {
        version: "0.4.16",
        settings: {
          optimizer: {
            enabled: true,
            runs: 50
          }
        }
      },
      "contracts/option/Turbo/Turbo.sol": {
        version: "0.8.16",
        settings: {
//        viaIR: true,
        optimizer: {
            enabled: true,
            runs: 700,
            details: {
              yul: true,
              yulDetails: {
               stackAllocation: true,
//               optimizerSteps: "dhfoDgvulfnTUtnIf"
              }
            }

          }
        }
      },
    }
  },
  networks: {
    hardhat: {
      timeout: 30000,
      gas: 50000000,  // tx gas limit
      blockGasLimit: 52500000,
      forking: {
        url:'http://localhost:9545',
//        blockNumber: 850,
        enabled: false,
      },
//      chainId: 9413
      // forking: {
      //   url: 'https://arb-mainnet.g.alchemy.com/v2/YEDyD7gAij8AQZDuabWpICLIBDf2eYp3',
      // }
    },
    private: {
      url: 'http://localhost:9545',
    },
    Arbi_testnet: {
      url: 'https://rinkeby.arbitrum.io/rpc',
      //accounts: [`${PRIVATE_KEY}`] 
    },
    mainnet: {
      url: `https://mainnet.infura.io/v3/${INFURA_KEY}`,
      accounts: [MAINNET_WALLET],
    },
    goerli: {
      url: `https://goerli.infura.io/v3/${INFURA_KEY}`,
      accounts: [GOERLI_WALLET],
    }
  },
  etherscan : {
    apiKey : ETHERSCAN_APIKEY,
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  gasReporter: {
    currency: 'USD',
    gasPrice: 63,
    // outputFile: './temp'
  },
  mocha: {
    timeout: 120000
  }
};
