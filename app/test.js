const { Aptos, AptosConfig, Network } = require('@aptos-labs/ts-sdk');

const walletAddress = '0x3d1392d1e43b46276470d0f5bd4850836ef3afdc85ba78d0a3f1c2669a47fe2f';

const aptosConfig = new AptosConfig({ network: Network.MAINNET });
const aptos = new Aptos(aptosConfig);
// const fund = await aptos.getAccountInfo({ accountAddress: walletAddress });

const getTransatcions = async () => {
    try {
        const transactions = await aptos.getAccountTransactions({ accountAddress: walletAddress, options: {limit: 200} });
        transactions.map(transaction => {
            if (transaction.payload.type_arguments.includes('0xf891d2e004973430cc2bbbee69f3d0f4adb9c7ae03137b4579f7bb9979283ee6::APTOS_FOMO::APTOS_FOMO')) {
                console.log(transaction.payload);
            }
        });
        // console.log(transactions);
    } catch (error) {
        console.error("Error fetching transactions:", error)
    }
}

getTransatcions()


// async function getTransactionsByAddress(address) {
//     const url = `https://fullnode.mainnet.aptoslabs.com/v1/accounts/${address}/transactions`;
  
//     try {
//       const response = await fetch(url);
//       if (!response.ok) {
//         throw new Error(`HTTP error! status: ${response.status}`);
//       }
//       const transactions = await response.json();
//       return transactions;
//     } catch (error) {
//       console.error('Error fetching transactions:', error);
//     }
//   }
  
//   // Usage:
//   const walletAddress = '0x431a8386faf7017f9805afa072bb9c9ad381b6470bebded8b3a2ac8c0afd12da'; // Replace with the actual wallet address
//   getTransactionsByAddress(walletAddress).then(transactions => {
//     transactions.map(transaction => {
//                     console.log(transaction.events);
//                 });
//     // console.log(transactions);
//   });