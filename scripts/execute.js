// Import required libraries
const fs = require('fs');
const axios = require('axios');
const { ethers, JsonRpcProvider } = require('ethers');
const { groth16 } = require('snarkjs');
const { FlashbotsBundleProvider } = require('@flashbots/ethers-provider-bundle');
const { wasm: wasmTester } = require('./zk-swaps/arrayReceived_js/witness_calculator');
const ABI = require('../artifacts/contracts/Trident.sol/Trident.json');
const contractABI = ABI.abi;
const dotenv = require('dotenv');
dotenv.config();

// Setup provider and signer
const provider = new JsonRpcProvider('https://eth-mainnet.g.alchemy.com/v2/OTNvTSVSqWA4LLcJlW9rBiDVG5o2gYW8');
const privateKey = process.env.PRIVATE_KEY;
const signer = new ethers.Wallet(privateKey, provider);

// Load token list
const tokenListRaw = fs.readFileSync('formattedTokens.json', 'utf8');
const tokenList = JSON.parse(tokenListRaw);

// Import functions
const {
  getRandomTokenSet,
  createAllTokenPairs,
  getPricesForPairs,
  getTxData,
} = require('./functions');

// Contract and token setup
const contractAddress = '0x2D4a6E547418aeFCC543bb536CE59fAc0a66733e';
const tokenSelect = tokenList.GURU;
const token = tokenSelect.address;
let amount = ethers.parseUnits('1000', tokenSelect.decimals);
const gasLimit = ethers.parseUnits("16000000", "wei");

// Path to the compiled wasm file
const wasmPath = './zk-swaps/arrayReceived_js/arrayReceived.wasm';
const zkeyPath = './zk-swaps/arrayReceived_final.zkey';
const verificationKeyPath = './zk-swaps/verification_key.json';

// Function to load and generate witness dynamically
async function generateWitness(input) {
  const wasmBuffer = fs.readFileSync(wasmPath);

  // Load the wasm buffer and create the witness calculator
  const witnessCalculator = await getWitnessCalculator(wasmBuffer);

  // Calculate the witness using the input
  const witnessBuffer = await witnessCalculator.calculateWTNSBin(input, 0);
  return witnessBuffer;
}

// Helper function to get the witness calculator
async function getWitnessCalculator(wasmBuffer) {
  return new Promise((resolve, reject) => {
      const wc = require(`${__dirname}/zk-swaps/arrayReceived_js/witness_calculator.js`);

      // Create a witness calculator instance from the wasm buffer
      wc(wasmBuffer)
          .then((witnessCalculator) => {
              resolve(witnessCalculator);
          })
          .catch((err) => {
              reject(err);
          });
  });
}

// Function to pad array with zeros until it reaches length n
function padArray(arr, n) {
    while (arr.length < n) {
        arr.push(0); // Append zero until the array has n elements
    }
    return arr;
}

// Function to generate proof from witness
async function generateProof(witnessBuffer) {
    return await groth16.prove(zkeyPath, witnessBuffer);
}

// Function to verify proof
async function verifyProof(proof, publicSignals) {
    return await groth16.verify(verificationKeyPath, publicSignals, proof);
}

// Function to initialize Flashbots provider
async function initializeFlashbotsProvider() {
    return await FlashbotsBundleProvider.create(
        provider,
        signer,
        'https://builder0x69.io/',
        'mainnet'
    );
}

// Main function to run the swapping cycle and ZKP proof generation
async function runCycle() {
    const tokenSet = getRandomTokenSet();
    const tokenPairs = createAllTokenPairs(tokenSet);
    const weights = await getPricesForPairs(tokenPairs);

    const cycleSwaps = tokenSet;
    console.log("We are swapping ", cycleSwaps);
    
    if (cycleSwaps.length > 0) {
        const firstOpportunity = cycleSwaps[0];
        console.log("First opportunity", firstOpportunity);
        let routing = Array.isArray(firstOpportunity) ? firstOpportunity.map(token => token.address) : [firstOpportunity.address];

        // Ensure routing array has exactly 10 elements by padding with zeros
        routing = padArray(routing, 10);

        let txData = [];
        let initialDstAmount = amount;

        // Generate ZKP proof using padded routing array and secret
        const secret = "1234567890"; // Secret for obfuscation
        const input = {
            arr: routing,  // Use padded routing array
            secret: secret,
        };

        // Step 1: Generate witness from runtime input
        const witnessBuffer = await generateWitness(input);

        // Step 2: Generate proof from witness
        const { proof, publicSignals } = await generateProof(witnessBuffer);

        // Step 3: Verify proof before proceeding
        const isValidProof = await verifyProof(proof, publicSignals);
        if (!isValidProof) {
            throw new Error("Invalid ZK proof");
        }
        console.log("ZKP verified successfully!");

        // Step 4: Proceed with Flashbots integration if ZKP is valid
        const flashbotsProvider = await initializeFlashbotsProvider();

        const signedBundle = await flashbotsProvider.signBundle([
            {
                signer: signer,
                transaction: {
                    to: contractAddress,
                    data: contractABI.encodeFunctionData('requestFlashLoan', [
                        token,
                        initialDstAmount,
                        routing,
                        txData
                    ]),
                    gasLimit: gasLimit,
                    maxPriorityFeePerGas: ethers.parseUnits("55", "gwei"),
                    maxFeePerGas: ethers.parseUnits("55", "gwei"),
                },
            },
        ]);

        const blockNumber = await provider.getBlockNumber();
        console.log("Simulating transaction...");
        const simulation = await flashbotsProvider.simulate(signedBundle, blockNumber + 1);

        if ("error" in simulation) {
            console.error(`Simulation Error: ${simulation.error.message}`);
            return;
        }

        console.log("Simulation successful. Sending transaction...");
        const response = await flashbotsProvider.sendRawBundle(signedBundle, blockNumber + 1);

        if ("error" in response) {
            console.error(`Error sending Flashbots transaction: ${response.error.message}`);
        } else {
            console.log("Transaction successfully sent to Flashbots!");
        }

        // Log results
        let results = {
            'token': token,
            'routing': routing,
            'initialDstAmount': initialDstAmount.toString(),
        };
        fs.appendFileSync('results.txt', `${JSON.stringify(results)}\n`);
    } else {
        console.log('No cycle swaps found.');
    }
}

// Run the cycle detection and swapping
(async () => {
    try {
        await runCycle();
    } catch (error) {
        console.error('Error during cycle detection:', error);
        fs.appendFileSync('errors.txt', `${error}\n`);
    }
})();
