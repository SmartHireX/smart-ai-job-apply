/**
 * OptimizedMathKernel
 * 
 * High-performance math operations for TinyML inference in the browser.
 * Uses Float32Array/Int8Array for SIMD-friendly operations and memory efficiency.
 * 
 * Optimizations:
 *   - TypedArrays for cache-friendly memory layout
 *   - Int8 quantization for 4x memory reduction
 *   - Fused operations to reduce memory allocation
 *   - Sparse matrix support for pruned networks
 *   - Pre-computed lookup tables for activation functions
 * 
 * @module OptimizedMathKernel
 * @version 1.0.0
 * @author SmartHireX AI Team
 */

class OptimizedMathKernel {

    // ========================================================================
    // STATIC CONFIGURATION
    // ========================================================================

    /** @type {number} Quantization scale for Int8 conversion */
    static QUANT_SCALE = 127.0;

    /** @type {number} Pruning threshold - weights below this are zeroed */
    static PRUNE_THRESHOLD = 0.01;

    /** @type {number} Leaky ReLU alpha */
    static LEAKY_ALPHA = 0.01;

    /** @type {number} Softmax temperature for calibration */
    static SOFTMAX_TEMPERATURE = 1.0;

    // ========================================================================
    // TYPED ARRAY UTILITIES
    // ========================================================================

    /**
     * Convert 2D array to flattened Float32Array (row-major)
     * @param {number[][]} matrix - 2D array
     * @returns {Float32Array}
     */
    static flatten2D(matrix) {
        const rows = matrix.length;
        const cols = matrix[0]?.length || 0;
        const flat = new Float32Array(rows * cols);

        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < cols; j++) {
                flat[i * cols + j] = matrix[i][j];
            }
        }

        return flat;
    }

    /**
     * Convert flattened Float32Array to 2D array
     * @param {Float32Array} flat - Flattened array
     * @param {number} rows - Number of rows
     * @param {number} cols - Number of columns
     * @returns {number[][]}
     */
    static unflatten2D(flat, rows, cols) {
        const matrix = [];
        for (let i = 0; i < rows; i++) {
            matrix[i] = [];
            for (let j = 0; j < cols; j++) {
                matrix[i][j] = flat[i * cols + j];
            }
        }
        return matrix;
    }

    /**
     * Convert 1D array to Float32Array
     * @param {number[]} arr - Regular array
     * @returns {Float32Array}
     */
    static toFloat32(arr) {
        return new Float32Array(arr);
    }

    // ========================================================================
    // QUANTIZATION (Int8)
    // ========================================================================

    /**
     * Quantize Float32 weights to Int8 (75% memory reduction)
     * @param {Float32Array} weights - Float32 weights
     * @returns {{ quantized: Int8Array, scale: number, zeroPoint: number }}
     */
    static quantizeWeights(weights) {
        // Find min/max for symmetric quantization
        let min = Infinity, max = -Infinity;
        for (let i = 0; i < weights.length; i++) {
            if (weights[i] < min) min = weights[i];
            if (weights[i] > max) max = weights[i];
        }

        // Symmetric quantization around zero
        const absMax = Math.max(Math.abs(min), Math.abs(max));
        const scale = absMax / 127.0;
        const zeroPoint = 0;  // Symmetric

        // Quantize
        const quantized = new Int8Array(weights.length);
        for (let i = 0; i < weights.length; i++) {
            const q = Math.round(weights[i] / scale);
            quantized[i] = Math.max(-127, Math.min(127, q));
        }

        return { quantized, scale, zeroPoint };
    }

    /**
     * Dequantize Int8 weights back to Float32
     * @param {Int8Array} quantized - Quantized weights
     * @param {number} scale - Quantization scale
     * @returns {Float32Array}
     */
    static dequantizeWeights(quantized, scale) {
        const float = new Float32Array(quantized.length);
        for (let i = 0; i < quantized.length; i++) {
            float[i] = quantized[i] * scale;
        }
        return float;
    }

    // ========================================================================
    // PRUNING
    // ========================================================================

    /**
     * Prune small weights to zero (creates sparsity)
     * @param {Float32Array} weights - Weight array
     * @param {number} threshold - Pruning threshold
     * @returns {{ pruned: Float32Array, sparsity: number }}
     */
    static pruneWeights(weights, threshold = OptimizedMathKernel.PRUNE_THRESHOLD) {
        const pruned = new Float32Array(weights.length);
        let zeroCount = 0;

        for (let i = 0; i < weights.length; i++) {
            if (Math.abs(weights[i]) < threshold) {
                pruned[i] = 0;
                zeroCount++;
            } else {
                pruned[i] = weights[i];
            }
        }

        const sparsity = zeroCount / weights.length;
        return { pruned, sparsity };
    }

    /**
     * Create sparse representation (CSR format) for very sparse matrices
     * @param {Float32Array} weights - Pruned weight matrix (flattened)
     * @param {number} rows - Number of rows
     * @param {number} cols - Number of columns
     * @returns {{ values: Float32Array, colIndices: Uint16Array, rowPtr: Uint16Array }}
     */
    static toSparseCSR(weights, rows, cols) {
        const values = [];
        const colIndices = [];
        const rowPtr = [0];

        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < cols; j++) {
                const val = weights[i * cols + j];
                if (val !== 0) {
                    values.push(val);
                    colIndices.push(j);
                }
            }
            rowPtr.push(values.length);
        }

        return {
            values: new Float32Array(values),
            colIndices: new Uint16Array(colIndices),
            rowPtr: new Uint16Array(rowPtr)
        };
    }

    // ========================================================================
    // OPTIMIZED MATRIX OPERATIONS
    // ========================================================================

    /**
     * Optimized matrix-vector multiplication using Float32Array
     * @param {Float32Array} matrix - Flattened matrix [rows x cols]
     * @param {Float32Array} vector - Input vector [cols]
     * @param {Float32Array} bias - Bias vector [rows]
     * @param {number} rows - Number of rows
     * @param {number} cols - Number of columns
     * @returns {Float32Array} Result vector [rows]
     */
    static matVecMul(matrix, vector, bias, rows, cols) {
        const result = new Float32Array(rows);

        for (let i = 0; i < rows; i++) {
            let sum = bias[i];
            const rowOffset = i * cols;

            // Unrolled loop for better performance
            let j = 0;
            const unrollLimit = cols - (cols % 4);

            for (; j < unrollLimit; j += 4) {
                sum += matrix[rowOffset + j] * vector[j]
                    + matrix[rowOffset + j + 1] * vector[j + 1]
                    + matrix[rowOffset + j + 2] * vector[j + 2]
                    + matrix[rowOffset + j + 3] * vector[j + 3];
            }

            // Handle remaining elements
            for (; j < cols; j++) {
                sum += matrix[rowOffset + j] * vector[j];
            }

            result[i] = sum;
        }

        return result;
    }

    /**
     * Sparse matrix-vector multiplication using CSR format
     * @param {Object} sparse - CSR sparse matrix { values, colIndices, rowPtr }
     * @param {Float32Array} vector - Input vector
     * @param {Float32Array} bias - Bias vector
     * @returns {Float32Array} Result vector
     */
    static sparseMatVecMul(sparse, vector, bias) {
        const rows = sparse.rowPtr.length - 1;
        const result = new Float32Array(rows);

        for (let i = 0; i < rows; i++) {
            let sum = bias[i];
            const start = sparse.rowPtr[i];
            const end = sparse.rowPtr[i + 1];

            for (let k = start; k < end; k++) {
                sum += sparse.values[k] * vector[sparse.colIndices[k]];
            }

            result[i] = sum;
        }

        return result;
    }

    // ========================================================================
    // ACTIVATION FUNCTIONS (SIMD-friendly)
    // ========================================================================

    /**
     * Apply Leaky ReLU in-place
     * @param {Float32Array} arr - Input/output array
     * @returns {Float32Array} Same array (modified in-place)
     */
    static leakyReLUInPlace(arr) {
        const alpha = OptimizedMathKernel.LEAKY_ALPHA;
        for (let i = 0; i < arr.length; i++) {
            arr[i] = arr[i] > 0 ? arr[i] : alpha * arr[i];
        }
        return arr;
    }

    /**
     * Apply Leaky ReLU (returns new array)
     * @param {Float32Array} arr - Input array
     * @returns {Float32Array} New array with activation applied
     */
    static leakyReLU(arr) {
        const alpha = OptimizedMathKernel.LEAKY_ALPHA;
        const result = new Float32Array(arr.length);
        for (let i = 0; i < arr.length; i++) {
            result[i] = arr[i] > 0 ? arr[i] : alpha * arr[i];
        }
        return result;
    }

    /**
     * Optimized Softmax with temperature scaling
     * @param {Float32Array} logits - Raw network outputs
     * @param {number} temperature - Temperature for calibration (default 1.0)
     * @returns {Float32Array} Probability distribution
     */
    static softmax(logits, temperature = OptimizedMathKernel.SOFTMAX_TEMPERATURE) {
        const result = new Float32Array(logits.length);

        // Find max for numerical stability
        let max = logits[0];
        for (let i = 1; i < logits.length; i++) {
            if (logits[i] > max) max = logits[i];
        }

        // Compute exp and sum
        let sum = 0;
        for (let i = 0; i < logits.length; i++) {
            result[i] = Math.exp((logits[i] - max) / temperature);
            sum += result[i];
        }

        // Normalize
        const invSum = 1.0 / sum;
        for (let i = 0; i < result.length; i++) {
            result[i] *= invSum;
        }

        return result;
    }

    // ========================================================================
    // OPTIMIZED FORWARD PASS
    // ========================================================================

    /**
     * Complete optimized forward pass for 2-layer network
     * @param {Float32Array} input - Input features
     * @param {Float32Array} W1 - Layer 1 weights (flattened)
     * @param {Float32Array} b1 - Layer 1 biases
     * @param {Float32Array} W2 - Layer 2 weights (flattened)
     * @param {Float32Array} b2 - Layer 2 biases
     * @param {number} inputSize - Input dimension
     * @param {number} hiddenSize - Hidden dimension
     * @param {number} outputSize - Output dimension
     * @returns {{ probs: Float32Array, hidden: Float32Array }}
     */
    static forward(input, W1, b1, W2, b2, inputSize, hiddenSize, outputSize) {
        // Layer 1: Input → Hidden (with Leaky ReLU)
        const z1 = OptimizedMathKernel.matVecMul(W1, input, b1, hiddenSize, inputSize);
        const hidden = OptimizedMathKernel.leakyReLU(z1);

        // Layer 2: Hidden → Output (with Softmax)
        const logits = OptimizedMathKernel.matVecMul(W2, hidden, b2, outputSize, hiddenSize);
        const probs = OptimizedMathKernel.softmax(logits);

        return { probs, hidden, z1, logits };
    }

    // ========================================================================
    // WEIGHT CACHING
    // ========================================================================

    /**
     * Create a weight cache for commonly accessed combinations
     * Pre-computes partial sums for frequently occurring input patterns
     * @param {Float32Array} W1 - Layer 1 weights
     * @param {number} inputSize - Input dimension
     * @param {number} hiddenSize - Hidden dimension
     * @returns {Map} Cache of input patterns to hidden activations
     */
    static createWeightCache(W1, inputSize, hiddenSize) {
        const cache = new Map();

        // Pre-compute for common input patterns (first 10 features active individually)
        for (let i = 0; i < Math.min(10, inputSize); i++) {
            const key = `single_${i}`;
            const partialSum = new Float32Array(hiddenSize);

            for (let h = 0; h < hiddenSize; h++) {
                partialSum[h] = W1[i * hiddenSize + h];
            }

            cache.set(key, partialSum);
        }

        return cache;
    }

    // ========================================================================
    // BENCHMARKING
    // ========================================================================

    /**
     * Benchmark forward pass performance
     * @param {Function} forwardFn - Forward pass function to benchmark
     * @param {number} iterations - Number of iterations
     * @returns {{ avgTime: number, minTime: number, maxTime: number }}
     */
    static benchmark(forwardFn, iterations = 100) {
        const times = [];

        // Warm-up
        for (let i = 0; i < 10; i++) {
            forwardFn();
        }

        // Actual benchmark
        for (let i = 0; i < iterations; i++) {
            const start = performance.now();
            forwardFn();
            times.push(performance.now() - start);
        }

        return {
            avgTime: times.reduce((a, b) => a + b, 0) / times.length,
            minTime: Math.min(...times),
            maxTime: Math.max(...times)
        };
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

if (typeof window !== 'undefined') {
    window.OptimizedMathKernel = OptimizedMathKernel;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = OptimizedMathKernel;
}
