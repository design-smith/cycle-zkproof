const axios = require('axios')
const fs = require('fs');
const tokenListRaw = fs.readFileSync('formattedTokens.json', 'utf8');
const tokenList = JSON.parse(tokenListRaw);
const { ethers } = require('ethers');
require('dotenv').config();

let baseTokens = {
  "USDC": {"symbol": "USDC", "address": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", "chain": "eth", "decimals": 6 },
  "DAI": {"symbol": "DAI", "address": "0x6b175474e89094c44da98b954eedeac495271d0f", "chain": "eth", "decimals": 18 },
  "USDT": { "symbol": "USDT", "address": "0xdac17f958d2ee523a2206206994597c13d831ec7", "chain": "eth", "decimals": 6 },
  "UNI": {"symbol": "UNI", "address": "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984", "chain": "eth", "decimals": 18 },
  "LINK": {"symbol": "LINK", "address": "0x514910771af9ca656af840dff83e8264ecf986ca", "chain": "eth", "decimals": 18},
  "MKR": {"symbol": "MKR", "address": "0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2", "chain": "eth", "decimals": 18 }
  };

baseTokens = Object.values(baseTokens);

let lastApiCallTime = 0;
const rateLimitDelay = 1000; // 1 second
async function enforceRateLimit() {
  const currentTime = Date.now();
  const timeSinceLastCall = currentTime - lastApiCallTime;
  if (timeSinceLastCall < rateLimitDelay) {
    await new Promise(resolve => setTimeout(resolve, rateLimitDelay - timeSinceLastCall));
  }
  lastApiCallTime = Date.now();
}


function getRandomTokenSet() {

    const tokens = Object.values(tokenList);
    const selectedTokens = [];
  
    // Randomly select one base token
    if (baseTokens.length > 0) {
      const baseToken = baseTokens[Math.floor(Math.random() * baseTokens.length)];
      selectedTokens.push(baseToken);
    }
  
    // Randomly select two other distinct tokens from the token list
    while (selectedTokens.length < 3) {
      const randomToken = tokens[Math.floor(Math.random() * tokens.length)];
      if (!selectedTokens.some(token => token.symbol === randomToken.symbol)) {
        selectedTokens.push(randomToken);
      }
    }
  
    return selectedTokens;
  }


function createAllTokenPairs(selectedTokens) {
  const pairs = [];

  // Generate all possible pairs, including both directions for each pair
  for (let i = 0; i < selectedTokens.length; i++) {
    for (let j = 0; j < selectedTokens.length; j++) {
      if (i !== j) {
        pairs.push([selectedTokens[i], selectedTokens[j]]);
      }
    }
  }

  return pairs;
}



async function getPriceForPair(pair) {
  await enforceRateLimit(); // Enforce rate limit before making the API call
  const url = "https://api.1inch.dev/swap/v6.0/1/quote";
  const config = {
    headers: {
      Authorization: `Bearer ${process.env.ONEINCH_API_KEY}`
    },
    params: {
      "src": pair[0].address,
      "dst": pair[1].address,
      "amount": ethers.parseUnits('1', pair[0].decimals)
    }
  };

  try {
    const response = await axios.get(url, config);
    const adjustedPrice = response.data.dstAmount / (10 ** pair[0].decimals);
    console.log(`Price for ${pair[0].symbol}-${pair[1].symbol}: ${adjustedPrice}`);
    return adjustedPrice;
  } catch (error) {
    console.error(error.response.statusText);
    return null;
  }
}

async function getPricesForPairs(pairs) {
  const weights = [];
  const RATE_LIMIT = 1;
  const DELAY_MS = 2000; // 1 second

  for (let i = 0; i < pairs.length; i += RATE_LIMIT) {
    const batch = pairs.slice(i, i + RATE_LIMIT);
    const batchPrices = await Promise.all(batch.map(pair => getPriceForPair(pair)));
    const batchWeights = batchPrices.map(price => -Math.log(price));
    weights.push(...batchWeights);

    if (i + RATE_LIMIT < pairs.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }

  return weights;
}

async function getTxData(pair, amount, contract, retries = 3, delay = 2000) {
  await enforceRateLimit(); // Enforce rate limit before making the API call

  const url = "https://api.1inch.dev/swap/v6.0/1/swap";
  const config = {
    headers: {
      Authorization: `Bearer ${process.env.ONEINCH_API_KEY}`
    },
    params: {
      src: pair[0],
      dst: pair[1],
      amount: amount,
      from: contract,
      slippage: "2",
      compatibility: "true",
      disableEstimate: "true",
    },
  };

  while (retries > 0) {
    try {
      const response = await axios.get(url, config);
      return response.data;
    } catch (error) {
      if (error.response && error.response.status === 429) {
        // Wait for the specified delay and then retry
        await new Promise((resolve) => setTimeout(resolve, delay));
        retries--;
        delay *= 2; // Exponential backoff
      } else {
        console.error(error.response.statusText);
        return null;
      }
    }
  }

  // If all retries are exhausted, throw an error
  throw new Error("Rate limit exceeded");
}


module.exports = {
  enforceRateLimit,
  getRandomTokenSet,
  createAllTokenPairs,
  getPriceForPair,
  getPricesForPairs,
  getTxData,
};
  