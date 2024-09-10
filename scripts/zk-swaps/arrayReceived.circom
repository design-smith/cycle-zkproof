pragma circom 2.0.0;

template ArrayReceived(n) {
    signal input arr[n];       // Array input (e.g., the routes for swapping)
    signal input secret;       // Secret input (could be used to obfuscate or mix the array)

    signal output out;         // The final output
    signal result[n];          // Intermediate results for each step

    // Initialize the first result
    result[0] <== arr[0] * secret;

    // Loop through the array and compute intermediate results
    for (var i = 1; i < n; i++) {
        result[i] <== result[i - 1] + arr[i] * secret;
    }

    // The final result is the last element of the intermediate results
    out <== result[n - 1] * secret;
}

component main = ArrayReceived(10);
