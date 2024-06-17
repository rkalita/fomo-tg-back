async function getExclusiveNFT(client, user) {
    if (!user.exclusive_nft) return null;

    const result = await client.query('SELECT exclusive_nfts.id, exclusive_nfts.title FROM lootboxes JOIN exclusive_nfts on lootboxes.exclusive_nft = exclusive_nfts.id WHERE lootboxes.tg_id = $1', [user.tg_id]);

    return result.rows ? result.rows.map((nft) => nft.title) : null;
}

module.exports = getExclusiveNFT;