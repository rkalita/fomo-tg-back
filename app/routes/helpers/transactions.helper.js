async function getTransatcions(walletAddress, existedTransactions, aptos, destWalletAddress) {
    try {
      const transactions = await aptos.getAccountTransactions({ accountAddress: walletAddress, options: {limit: 20} });
      return transactions.filter(transaction => {
          return transaction.payload.type_arguments.includes('0xf891d2e004973430cc2bbbee69f3d0f4adb9c7ae03137b4579f7bb9979283ee6::APTOS_FOMO::APTOS_FOMO') &&
              transaction.payload.arguments.includes(destWalletAddress) &&
              (existedTransactions ? !existedTransactions.includes(transaction.timestamp) : true) &&
              transaction.success == true &&
              transaction.vm_status == 'Executed successfully';
      }).map(transaction => {
          return {
              timestamp: transaction.timestamp, 
              amount: transaction.events.filter((event) => event.type='0x1::coin::DepositEvent')[0].data.amount / 1000000
          };
      });
    } catch (error) {
        console.error("Error fetching transactions:", error);
        return false;
    }
}

module.exports = getTransatcions;