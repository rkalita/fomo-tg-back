async function routes(fastify, options) {

    //OPEN LOOTBOX
    fastify.get('/api/open-lootbox/:id', async (req, reply) => {
        const userId = req.params.id;
        const query = req.query;
        let boxesCount = 1;
      
        try {
          const client = await fastify.pg.connect();
      
          try {
            const userData = await client.query('SELECT wallet_address FROM users WHERE tg_id = $1', [userId]);
      
            if (!userData?.rows[0]?.wallet_address) {
              reply.status(404).send({ error: "No wallets found" });
              return;
            }
      
            const lootboxesDB = await client.query('SELECT lootbox FROM inventory WHERE tg_id = $1', [userId]);
      
            if (!lootboxesDB?.rows[0]?.lootbox) {
              reply.status(404).send({ error: "You have no lootboxes" });
              return;
            } else if (query['all']) {
              boxesCount = lootboxesDB.rows[0].lootbox;
            }
      
            const lootboxesGroup = await client.query('SELECT * FROM lootbox_groups WHERE wallet_address = $1', [userData.rows[0].wallet_address]);
            let randomFreeLootboxResult = await getRandomLootboxes(client, lootboxesGroup, boxesCount);
      
            if (!lootboxesGroup?.rows[0]?.group_id || !randomFreeLootboxResult?.rows.length) {
              randomFreeLootboxResult = await client.query(`
                SELECT id
                FROM lootboxes
                WHERE tg_id IS NULL
                AND group_id IS NULL
                ORDER BY RANDOM()
                LIMIT $1
              `, [boxesCount]);
            }
      
            const randomFreeLootbox = randomFreeLootboxResult.rows[0] || null;
      
            if (!randomFreeLootbox) {
              reply.status(404).send({ error: "No valid lootboxes" });
              return;
            }
      
            const unpackRandomLootboxResult = await client.query(`
              UPDATE lootboxes SET tg_id = $1, opened_at = NOW()
              WHERE id = ANY($2::int[])
              RETURNING *
            `, [userId, randomFreeLootboxResult.rows.map(row => row.id)]);
      
            const loot = await processLootboxes(client, unpackRandomLootboxResult, userId);
      
            const updateInventory = await client.query('UPDATE inventory SET lootbox = lootbox - $1 WHERE tg_id = $2 RETURNING *', [boxesCount, userId]);
      
            if (loot.length) {
              reply.send({
                ...updateInventory.rows[0],
                loot
              });
            } else {
              console.log(`User ${userId} opened the lootbox: Empty`);
              reply.send(false);
            }
          } catch (err) {
            console.error('Database query error:', err);
            reply.status(500).send({ error: 'Internal Server Error' });
          } finally {
            client.release();
          }
        } catch (err) {
          console.error('Connection error:', err);
          reply.status(500).send({ error: 'Internal Server Error' });
        }
      });
      
      async function getRandomLootboxes(client, lootboxesGroup, boxesCount) {
        if (lootboxesGroup?.rows[0]?.group_id) {
          let result = await client.query(`
            SELECT id
            FROM lootboxes
            WHERE tg_id IS NULL
            AND group_id = $1
            ORDER BY RANDOM()
            LIMIT $2
          `, [lootboxesGroup.rows[0].group_id, boxesCount]);
      
          if (result.rows.length && boxesCount > result.rows.length) {
            const moreBoxes = await client.query(`
              SELECT id
              FROM lootboxes
              WHERE tg_id IS NULL
              AND group_id IS NULL
              ORDER BY RANDOM()
              LIMIT $1
            `, [boxesCount - result.rows.length]);
      
            result.rows = result.rows.concat(moreBoxes.rows);
          }
      
          return result;
        }
      
        return null;
      }
      
      async function processLootboxes(client, unpackRandomLootboxResult, userId) {
        const loot = [];
      
        for (const unpackRandomLootbox of unpackRandomLootboxResult.rows) {
          for (const [key, value] of Object.entries(unpackRandomLootbox)) {
            if (value !== null && !['id', 'tg_id', 'rewarded', 'opened_at', 'group_id'].includes(key)) {
              const item = key;
              const count = value;
              await client.query(`UPDATE inventory SET ${item} = ${item} + $1 WHERE tg_id = $2`, [item !== 'nft' ? +count : 1, userId]);
      
              let nft = null;
              let exclusiveNft = null;
      
              if (item === 'nft') {
                const nftResult = await client.query('SELECT * FROM nfts WHERE id = $1', [unpackRandomLootbox.nft]);
                nft = nftResult.rows[0]?.title || null;
              }
      
              if (item === 'exclusive_nft') {
                const exclusiveNftResult = await client.query('SELECT * FROM exclusive_nfts WHERE id = $1', [unpackRandomLootbox.exclusive_nft]);
                exclusiveNft = exclusiveNftResult.rows[0]?.title || null;
              }
      
              loot.push({
                item,
                value: +count,
                nft,
                exclusive_nft: exclusiveNft
              });
            }
          }
        }
      
        return loot;
      }
      
}

module.exports = routes;