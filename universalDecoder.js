const fs = require("fs");
const { utils } = require("ethers");
const { decode } = require("punycode");

// https://docs.uniswap.org/contracts/universal-router/technical-reference
const swapCodes = {
    "00": "V3_SWAP_EXACT_IN",
    "01": "V3_SWAP_EXACT_OUT",
    "02": "PERMIT2_TRANSFER_FROM",
    "08": "V2_SWAP_EXACT_IN",
    "09": "V2_SWAP_EXACT_OUT",
    "0a": "PERMIT2_PERMIT",
    "0c": "UNWRAP_WETH"
};

const v2VersionDictionary = {
    "swapExactETHForTokens": ["V3_SWAP_EXACT_IN", "V2_SWAP_EXACT_IN"],
    "swapETHForExactTokens": ["V3_SWAP_EXACT_OUT", "V2_SWAP_EXACT_OUT"]
}

let universalABI = JSON.parse(fs.readFileSync('./tests/UNISWAP_UNIVERSAL_ABI.json', 'utf-8'));
let universalInteface = new utils.Interface(universalABI);

module.exports = {
    decodeExecute: decodeExecute,
    extractPathFromV3: extractPathFromV3,
    buildTransactionObject: buildTransactionObject
}

function buildTransactionObject(transactionDetails, decodedFunction) {
    let methodName;
    if (v2VersionDictionary["swapExactETHForTokens"].includes(decodedFunction.function)) {
        methodName = "swapExactETHForTokens";
    } else if (v2VersionDictionary["swapETHForExactTokens"].includes(decodedFunction.function)) {
        methodName = "swapETHForExactTokens";
    }

    let contractCall = {
        "methodName": methodName,
        "params": {
            "amountIn": decodedFunction.amountIn,
            "amountOut": decodedFunction.amountOut,
            "path": decodedFunction.path,
            "deadline": "99999999999"
        }
    }


    if (methodName === undefined) {
        return undefined;
    }

    return {
        'status': transactionDetails.status,
        'direction': transactionDetails.direction,
        'hash': transactionDetails.hash,
        'value': transactionDetails.value,
        'contractCall': JSON.stringify(contractCall),
        'counterparty': transactionDetails.counterparty,
        'estimatedBlocksUntilConfirmed': transactionDetails.estimatedBlocksUntilConfirmed,
        'dispatchTimestamp': transactionDetails.dispatchTimestamp,
        'maxFeePerGas': transactionDetails.maxFeePerGas,
        'maxPriorityFeePerGas': transactionDetails.maxPriorityFeePerGas,
        'gas': transactionDetails.gas,
        'from': transactionDetails.from,
        'type': transactionDetails.type,
        'gasPriceGwei': transactionDetails.gasPriceGwei,
        'gasPrice': transactionDetails.gasPriceGwei
    }
}
const abiCoder = new utils.AbiCoder();
function decodeFunction(foundFunction, inputForFunction) {
    let decoded;
    console.log(swapCodes[foundFunction])
    switch (swapCodes[foundFunction]) {
        case "V3_SWAP_EXACT_IN": //"exactInput" FNC 11
            decoded = abiCoder.decode(["address", "uint256", "uint256", "bytes", "bool"], inputForFunction);
            return {
                function: swapCodes[foundFunction],
                recipient: decoded[0],
                amountIn: decoded[1].toString(),
                amountOut: decoded[2].toString(),
                path: extractPathFromV3(decoded[3]),
                payerIsUser: decoded[4]
            }
        case "V3_SWAP_EXACT_OUT": //exactOutputSingle FNC 9
            decoded = abiCoder.decode(["address", "uint256", "uint256", "bytes", "bool"], inputForFunction);
            return {
                function: swapCodes[foundFunction],
                recipient: decoded[0],
                amountIn: decoded[2].toString(),
                amountOut: decoded[1].toString(),
                path: extractPathFromV3(decoded[3], true), // because exact output swaps are executed in reverse order, in this case tokenOut is actually tokenIn
                payerIsUser: decoded[4]
            }
        case "PERMIT2_TRANSFER_FROM": //PERMIT2_TRANSFER_FROM 
            decoded = abiCoder.decode(["address", "address", "uint256"], inputForFunction);
            return {
                function: swapCodes[foundFunction],
                recipient: decoded[0],
                amountIn: decoded[2].toString(),
                amountOut: decoded[1].toString(),
                path: extractPathFromV3(decoded[3], true), // because exact output swaps are executed in reverse order, in this case tokenOut is actually tokenIn
                payerIsUser: decoded[4]
            }
        case "V2_SWAP_EXACT_IN":
            decoded = abiCoder.decode(["address", "uint256", "uint256", "address[]", "bool"], inputForFunction);
            return {
                function: swapCodes[foundFunction],
                recipient: decoded[0],
                amountIn: decoded[1].toString(),
                amountOut: decoded[2].toString(),
                path: decoded[3],
                payerIsUser: decoded[4]
            }
        case "V2_SWAP_EXACT_OUT":
            decoded = abiCoder.decode(["address", "uint256", "uint256", "address[]", "bool"], inputForFunction);
            return {
                function: swapCodes[foundFunction],
                recipient: decoded[0],
                amountIn: decoded[2].toString(),
                amountOut: decoded[1].toString(),
                path: decoded[3],
                payerIsUser: decoded[4]
            }
        case "PERMIT2_PERMIT": // https://github.com/Uniswap/permit2/blob/main/src/interfaces/IAllowanceTransfer.sol
            return decodePermit2(foundFunction, inputForFunction)
        default:
            console.info("No parseable execute function found in input.")
            return undefined;
    }
}


// struct PermitDetails {
//     // ERC20 token address
//     address token;
//     // the maximum amount allowed to spend
//     uint160 amount;
//     // timestamp at which a spender's token allowances become invalid
//     uint48 expiration;
//     // an incrementing value indexed per owner,token,and spender for each signature
//     uint48 nonce;
// }
//    struct PermitSingle {
//     // the permit data for a single token alownce
//     PermitDetails details;
//     // address permissioned on the allowed tokens
//     address spender;
//     // deadline on the permit signature
//     uint256 sigDeadline;
// }
// IAllowanceTransfer.PermitSingle bytes
function decodePermit2(foundFunction, inputForFunction) {
    console.log(` decodePermit2 inputForFunction : ${inputForFunction}`)
    decoded = abiCoder.decode(["tuple(tuple(address,uint160,uint48,uint48),address,uint256)", "bytes"], inputForFunction);
    console.log(decoded)
    return {
        function: swapCodes[foundFunction],
        PermitDetails: {
            token: decoded[0][0][0],
            amount: decoded[0][0][1].toString(),
            expiration: decoded[0][0][2],
            nonce: decoded[0][0][3]
        },
        spender: decoded[0][1].toString(),
        sigDeadline: decoded[0][2].toString(),
        sig: decoded[1]
    }
}

function decodeExecute(transactionInput) {
    const parsedTx = universalInteface.parseTransaction({ data: transactionInput });

    let commandsSplit = parsedTx.args[0].substring(2).match(/.{1,2}/g);

    let foundFunction;
    let inputForFunction;
    commandsSplit.forEach(
        commandCode => {
            const currentIndex = Object.keys(swapCodes).indexOf(commandCode)
            if (currentIndex !== -1) {
                foundFunction = commandCode;
                console.log(`foundFunction: ${swapCodes[foundFunction]}`)
                inputForFunction = parsedTx.args[1][commandsSplit.indexOf(commandCode)];
                r = decodeFunction(foundFunction, inputForFunction)
                console.log(r)
            }
        }
    )


}

function extractPathFromV3(fullPath, reverse = false) {
    const fullPathWithoutHexSymbol = fullPath.substring(2);
    let path = [];
    let currentAddress = "";
    for (let i = 0; i < fullPathWithoutHexSymbol.length; i++) {
        currentAddress += fullPathWithoutHexSymbol[i];
        if (currentAddress.length === 40) {
            path.push('0x' + currentAddress);
            i = i + 6;
            currentAddress = "";
        }
    }
    if (reverse) {
        return path.reverse();
    }
    return path;
}
