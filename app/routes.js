async function routes(fastify, options) {
  const { Aptos, AptosConfig, Network } = require('@aptos-labs/ts-sdk');
  const aptosConfig = new AptosConfig({ network: Network.MAINNET });
  const aptos = new Aptos(aptosConfig);
  const destWalletAddress = '0x431a8386faf7017f9805afa072bb9c9ad381b6470bebded8b3a2ac8c0afd12da';

  const getTransatcions = async (walletAddress, existedTransactions) => {
    try {
      const transactions = await aptos.getAccountTransactions({ accountAddress: walletAddress, options: {limit: 50} });
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

  //Set wallet address
  fastify.post('/api/wallet', (request, reply) => {
    fastify.pg.connect(onConnect)
  
    function onConnect (err, client, release) {
      if (err) return reply.send(err);

      console.log(request.body);
  
      client.query(
        `UPDATE users SET wallet_address='${request.body.wallet_address}' WHERE tg_id='${request.body.tg_id}'`,
        function onResult (err, result) {
          release()
          reply.send(err || result)
        }
      )
    }
  });

  // INIT TABLE. Launch just once to create the table
  fastify.get('/api/initDB', (req, reply) => {
    return fastify.pg.transact(async client => {

      await client.query('CREATE TABLE IF NOT EXISTS "users" ("tg_id" varchar(250) PRIMARY KEY,"tg_username" varchar(250),"wallet_address" varchar(250) UNIQUE,"score" integer, "energy" integer NOT NULL DEFAULT 0, referral_code VARCHAR(20) UNIQUE, "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "first_day_drink" TIMESTAMPTZ, last_taps_count integer NOT NULL DEFAULT 0, captcha_rewarded_at TIMESTAMPTZ);');
      await client.query('CREATE TABLE IF NOT EXISTS "inventory" ("tg_id" varchar(250) PRIMARY KEY,"cola" integer NOT NULL DEFAULT 0,"super_cola" integer NOT NULL DEFAULT 0,"yellow_cola" integer NOT NULL DEFAULT 0,"donut" integer NOT NULL DEFAULT 0,"gold_donut" integer NOT NULL DEFAULT 0, "lootbox" integer NOT NULL DEFAULT 0, "nft" integer NOT NULL DEFAULT 0, "apt" integer NOT NULL DEFAULT 0, "fomo" bigint NOT NULL DEFAULT 0);');
      await client.query('CREATE TABLE IF NOT EXISTS "refs" ("referral_id" varchar(250),"referrer_id" varchar(250) UNIQUE,"rewarded" TIMESTAMPTZ,"created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW());');
      await client.query('CREATE TABLE IF NOT EXISTS "transactions" ("wallet_address" varchar(250),"date" BIGINT,"amount" INTEGER NOT NULL DEFAULT 0, "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW());');

      //INDEXES
      await client.query('CREATE INDEX IF NOT EXISTS idx_users_tg_id ON users (tg_id);');
      await client.query('CREATE INDEX IF NOT EXISTS idx_users_score ON users (score);');
      await client.query('CREATE INDEX IF NOT EXISTS idx_inventory_tg_id ON inventory (tg_id);');
      await client.query('CREATE INDEX IF NOT EXISTS idx_refs_referrer_id ON refs (referrer_id);');
      await client.query('CREATE INDEX IF NOT EXISTS idx_refs_rewarded ON refs (rewarded);');

      return true;
    })
  });

  // GET users
  fastify.get('/api/users', (req, reply) => {
    fastify.pg.connect(onConnect)
  
    function onConnect (err, client, release) {
      if (err) return reply.send(err)
  
      client.query(
        'SELECT users.tg_username, users.score from users ORDER BY users.score DESC, users.tg_username LIMIT 100',
        function onResult (err, result) {
          
          release()
          reply.send(err || result.rows)
        }
      )
    }
  })

  //GET ONE USER
  fastify.get('/api/users/:id', async (req, reply) => {
    try {
      const userId = req.params.id;
      const client = await fastify.pg.connect();
  
      try {
        const userResult = await client.query(
          `SELECT users.tg_id, users.tg_username, users.wallet_address, users.score, users.energy, 
                  users.first_day_drink, users.referral_code, inventory.cola, inventory.super_cola, 
                  inventory.yellow_cola, inventory.lootbox, inventory.donut, inventory.gold_donut 
            FROM users 
            INNER JOIN inventory ON users.tg_id = inventory.tg_id 
            WHERE users.tg_id = $1`,
          [userId]
        );
        let user = userResult.rows[0];
  
        const positionResult = await client.query(
          `WITH ranked_table AS (
              SELECT *, ROW_NUMBER() OVER (ORDER BY score DESC, users.tg_username) AS row_num 
              FROM users
            ) 
            SELECT row_num 
            FROM ranked_table 
            WHERE tg_id = $1`,
          [userId]
        );
        const position = positionResult.rows[0];
  
        const invitedResult = await client.query(
          `SELECT COUNT(*) AS count 
            FROM refs 
            WHERE referral_id = $1`,
          [userId]
        );
        const invited = invitedResult.rows[0];
  
        if (user.cola < 4 && user.first_day_drink) {
          const firstDayDrinkDateTime = new Date(user.first_day_drink);
          const currentDate = new Date();
          const timeDifferenceHours = (currentDate - firstDayDrinkDateTime) / (1000 * 60 * 60);
  
          if (timeDifferenceHours >= 6) {
            const recoveredBottlesCount = Math.floor(timeDifferenceHours / 6);
            const inventoryResult = await client.query(
              `UPDATE inventory
                SET cola = CASE
                  WHEN cola + $1 <= 4 THEN cola + $1
                  ELSE 4
                END
                WHERE tg_id = $2 
                RETURNING cola`,
              [recoveredBottlesCount, userId]
            );
  
            await client.query(
              `UPDATE users 
                SET first_day_drink = first_day_drink + INTERVAL '6 hours' * $1 
                WHERE tg_id = $2`,
              [recoveredBottlesCount, userId]
            );
  
            user.cola = inventoryResult.rows[0].cola;
          }
        }
  
        client.release();
        reply.send({ ...user, rate: +position.row_num, invited: +invited.count });
      } catch (err) {
        client.release();
        console.error('Database query error:', err);
        reply.status(500).send(new Error('Internal Server Error'));
      }
    } catch (err) {
      console.error('Connection error:', err);
      reply.status(500).send(new Error('Internal Server Error'));
    }
  });
  

  //Create user
  fastify.post('/api/users', (request, reply) => {
    return fastify.pg.transact(async client => {
      const newUser = request.body;
      const randomString = Array.from(crypto.getRandomValues(new Uint8Array(15)))
                          .map(b => String.fromCharCode(65 + b % 26))
                          .join('');
      const refCode = btoa(randomString).substring(0, 15);

      const userExists = await client.query(`SELECT * FROM users WHERE tg_id='${newUser.tg_id}'`);

      if (!userExists?.rows?.length) {
        const users = await client.query(`INSERT into users (tg_id,tg_username,score,energy, referral_code) VALUES(${newUser.tg_id},'${newUser.tg_username || 'DonutLover'}',0,50,'${refCode}') ON CONFLICT DO NOTHING RETURNING tg_id;`);
        await client.query(`INSERT into inventory (tg_id,cola,super_cola,donut,gold_donut) VALUES(${newUser.tg_id},2,0,0,0) ON CONFLICT DO NOTHING;`);

        if (users.rows?.length && newUser?.refCode) {
          const refUser = await client.query(`SELECT tg_id FROM users WHERE referral_code='${newUser?.refCode}'`);
          if (refUser.rows?.length) {
            await client.query(`INSERT INTO refs (referral_id, referrer_id)
            SELECT '${refUser.rows[0].tg_id}', '${newUser.tg_id}'
            WHERE NOT EXISTS (
                SELECT 1
                FROM refs
                WHERE referrer_id = '${newUser.tg_id}'
                  AND referral_id = '${refUser.rows[0].tg_id}'
            );`);
          }
        }
        console.log(`NEW_USER - User id: ${users.rows[0].tg_id}, score: ${users.rows[0].score}, energy: ${users.rows[0].energy}`);
  
        return users.rows[0];
      }
  
      return userExists.rows[0];
    })
  });

  //GULP
  fastify.patch('/api/gulp/:tg_id', (request, reply) => {
    return fastify.pg.transact(async client => {
      const tg_id = request.params.tg_id;
      const gulpItems = request.body;
      let user = null;
      let inventory = null;
  
      // Initial query to fetch current inventory values
      const inventoryResult = await client.query('SELECT cola, super_cola FROM inventory WHERE tg_id = $1', [tg_id]);
      inventory = inventoryResult.rows[0];
  
      console.log(`GULP INPUT - User id: ${tg_id}, item: ${gulpItems.item}, cola: ${inventory.cola}, super_cola: ${inventory.super_cola}`);
  
      if (gulpItems.item === 'cola') {
        inventory = await client.query(`
          UPDATE inventory
          SET cola = CASE
            WHEN cola - 1 < 0 THEN 0
            ELSE cola - 1
          END
          WHERE tg_id = $1
          RETURNING *;`, [tg_id]);
  
        user = await client.query(`
          UPDATE users
          SET energy = CASE
            WHEN energy + 25 <= 100 THEN energy + 25
            ELSE 100
          END,
          first_day_drink = CASE
            WHEN first_day_drink IS NULL THEN NOW()
            WHEN first_day_drink <= NOW() - INTERVAL '24 hours' THEN NOW()
            ELSE first_day_drink
          END
          WHERE tg_id = $1
          RETURNING tg_username, wallet_address, score, energy;`, [tg_id]);
  
      } else if (gulpItems.item === 'super_cola') {
        user = await client.query('UPDATE users SET energy = 100 WHERE tg_id = $1 RETURNING tg_username, wallet_address, score, energy;', [tg_id]);
  
        inventory = await client.query(`
          UPDATE inventory
          SET super_cola = CASE
            WHEN super_cola - 1 < 0 THEN 0
            ELSE super_cola - 1
          END
          WHERE tg_id = $1
          RETURNING *;`, [tg_id]);
      } else if (gulpItems.item === 'yellow_cola') {
        inventory = await client.query(`
          UPDATE inventory
          SET super_cola = CASE
            WHEN yellow_cola - 1 < 0 THEN 0
            ELSE yellow_cola - 1
          END
          WHERE tg_id = $1
          RETURNING *;`, [tg_id]);

          user = await client.query(`
          UPDATE users
          SET energy = CASE
            WHEN energy + 50 <= 100 THEN energy + 50
            ELSE 100
          END
          WHERE tg_id = $1
          RETURNING tg_username, wallet_address, score, energy;`, [tg_id]);
      }
  
      const updatedInventory = inventory.rows[0];
      const updatedUser = user.rows[0];
  
      console.log(`GULP OUTPUT - User id: ${tg_id}, item: ${gulpItems.item}, cola: ${updatedInventory.cola}, super_cola: ${updatedInventory.super_cola}`);
  
      return { ...updatedUser, ...updatedInventory };
    });
  });
  
  //TAP
  fastify.patch('/api/tap/:tg_id', (req, reply) => {
    return fastify.pg.transact(async client => {
      const tg_id = req.params.tg_id;
      let taps = parseInt(req.body.taps, 10);
  
      const userResult = await client.query('SELECT score, energy FROM users WHERE tg_id = $1', [tg_id]);
      const user = userResult.rows[0];
  
      if (!user) {
        reply.status(404).send(new Error('User not found'));
        return;
      }
  
      const inventoryResult = await client.query('SELECT donut, gold_donut FROM inventory WHERE tg_id = $1', [tg_id]);
      const inventory = inventoryResult.rows[0];
  
      console.log(`TAPS - User id: ${tg_id}, taps: ${taps}, energy: ${inventory?.energy}`);
  
      if (+taps > user.energy) {
        taps = user.energy;
        reply.status(422).send(new Error('Invalid data'));
        return;
      }
  
      const updatedInventoryResult = await client.query(
        'UPDATE inventory SET donut = donut + $1 * 1000 WHERE tg_id = $2 RETURNING cola, super_cola, donut, gold_donut',
        [taps, tg_id]
      );
  
      const updatedUserResult = await client.query(
        'UPDATE users SET score = score + $1 * 1000, energy = energy - $1, last_taps_count = $1, updated_at = NOW() WHERE tg_id = $2 RETURNING tg_id, tg_username, wallet_address, score, energy, referral_code',
        [taps, tg_id]
      );
  
      const updatedInventory = updatedInventoryResult.rows[0];
      const updatedUser = updatedUserResult.rows[0];
  
      return { ...updatedUser, ...updatedInventory };
    });
  });    

  //Golden SWAP
  fastify.patch('/api/swap/:tg_id', (req, reply) => {
    return fastify.pg.transact(async client => {
      let goldenDonutsCount = 0;
      const donuts = req.body.donuts;
      const inventory = await client.query(`SELECT inventory.donut FROM inventory WHERE inventory.tg_id='${req.params.tg_id}'`);

      if (donuts > inventory.rows[0].donut) {
        return reply.status(422).send(new Error('Invalid data'));
      }

      goldenDonutsCount = Math.floor(+donuts / 100000);

      const inventoryUpdate = await client.query(`UPDATE inventory SET gold_donut= gold_donut + ${goldenDonutsCount}, donut= donut - ${goldenDonutsCount * 100000} WHERE tg_id='${req.params.tg_id}' RETURNING cola, super_cola, donut, gold_donut`);

      return inventoryUpdate.rows[0];
    })
  });    

  //Lucky SWAP
  fastify.patch('/api/lucky-swap/:tg_id', (req, reply) => {
    return fastify.pg.transact(async client => {
      let lootboxCount = 0;
      const donuts = req.body.donuts;
      const inventory = await client.query(`SELECT inventory.gold_donut FROM inventory WHERE inventory.tg_id='${req.params.tg_id}'`);

      if (donuts > inventory.rows[0].gold_donut) {
        return reply.status(422).send(new Error('Invalid data'));
      }

      lootboxCount = Math.floor(+donuts / 3);

      const inventoryUpdate = await client.query(`UPDATE inventory SET lootbox= lootbox + ${lootboxCount}, donut= gold_donut - ${lootboxCount * 3} WHERE tg_id='${req.params.tg_id}' RETURNING cola, super_cola, donut, gold_donut, lootbox`);

      return inventoryUpdate.rows[0];
    })
  });

  //CAPTCHA
  fastify.patch('/api/captcha/:tg_id', (request, reply) => {
    return fastify.pg.transact(async client => {

      const captchaItems = request.body;

      if (!captchaItems.hash) {
        return;
      }
      
      const jsonString = atob(captchaItems.hash);
      const params = JSON.parse(jsonString);
      
      const user = await client.query(`SELECT tg_id from users 
        WHERE tg_id='${request.params.tg_id}'
        AND last_taps_count = ${params.tps || 0}
        AND referral_code = '${params?.rfcd || 0}'
        AND (captcha_rewarded_at IS NULL OR captcha_rewarded_at <= NOW() - INTERVAL '24 hours');`
      );
      
      if (user.rows?.length) {
        const inventory = await client.query(`UPDATE inventory SET donut = donut + 1000 WHERE tg_id='${user.rows[0].tg_id}';`);
        const userUpdated = await client.query(`UPDATE users SET captcha_rewarded_at=NOW() WHERE tg_id='${user.rows[0].tg_id}' RETURNING tg_id, tg_username, wallet_address, score, energy, referral_code;`);

        return userUpdated.rows[0];
      }

      return {hash: captchaItems?.hash};
  
    })
  });

  //GOLDEN CLAIM
  fastify.get('/api/claim/:id', async (req, reply) => {
    const updateTransactionsAndInventory = async (transactions, walletAddress, tgId, client) => {
      let goldenDonutsCount = 0;
      let totalAmount = 0;
      for (const transaction of transactions) {
        if (transaction.amount % 1000000 === 0 && transaction.amount / 1000000 > 0) {
          goldenDonutsCount = (transaction.amount / 1000000) * 5;

          await client.query(
            `INSERT INTO transactions (wallet_address, date, amount) VALUES($1, $2, $3) ON CONFLICT DO NOTHING;`,
            [walletAddress, transaction.timestamp, transaction.amount]
          );
          await client.query(
            `UPDATE inventory SET gold_donut = gold_donut + $1 WHERE tg_id = $2;`,
            [goldenDonutsCount, tgId]
          );

          totalAmount += goldenDonutsCount;
        }
      }

      return totalAmount;
    };
  
    try {
      const userId = req.params.id;
      const client = await fastify.pg.connect();
  
      try {
        const walletResult = await client.query('SELECT wallet_address FROM users WHERE tg_id = $1', [userId]);
        const wallet = walletResult?.rows[0]?.wallet_address || null;
  
        if (!wallet) {
          reply.status(404).send({ error: "No wallet found" });
          return;
        }
  
        const existedTransactionsResult = await client.query('SELECT date FROM transactions WHERE wallet_address = $1', [wallet]);
        const existedTransactions = existedTransactionsResult?.rows?.map(transaction => transaction?.date);
  
        // Make sure to define the getTransactions function or import it if it's external
        const transactions = await getTransatcions(wallet, existedTransactions);
  
        console.log(transactions);

        if (
          !transactions || 
          !transactions.length ||
          !transactions.find(transaction => transaction.amount % 1000000 === 0 && transaction.amount / 1000000 > 0)
        ) {
          reply.status(404).send({ error: "No valid transactions found" });
          return;
        }

        const claimed = await updateTransactionsAndInventory(transactions, wallet, userId, client);
  
        reply.send({claimed});
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
  

  // -------------------------------------- CRON routes start ---------------------------------------------
  
  // INITERNAL REF REWARDS CHECKER
  fastify.get('/api/refCheck', async (req, reply) => {
    const query = req.query;
  
    if (!query['secret'] || query['secret'] !== process.env.INVENTORY_SECRET) {
      return reply.status(422).send(new Error('Invalid data'));
    }
  
    try {
      await fastify.pg.transact(async client => {
        await client.query(`
          WITH eligible_referrers AS (
            SELECT refs.referral_id, COUNT(*) AS referrers_count
            FROM refs
            JOIN users ON refs.referrer_id = users.tg_id
            WHERE users.score >= 100000 AND refs.rewarded IS NULL
            GROUP BY refs.referral_id
          )
          UPDATE inventory
          SET donut = donut + (25000 * eligible_referrers.referrers_count)
          FROM eligible_referrers
          WHERE inventory.tg_id = eligible_referrers.referral_id;
        `);
  
        await client.query(`
          WITH eligible_referrers AS (
            SELECT refs.referral_id
            FROM refs
            JOIN users ON refs.referrer_id = users.tg_id
            WHERE users.score >= 100000 AND refs.rewarded IS NULL
          )
          UPDATE refs
          SET rewarded = NOW()
          FROM eligible_referrers
          WHERE refs.referral_id = eligible_referrers.referral_id;
        `);
      });
  
      reply.send({ success: true });
    } catch (error) {
      console.error('Transaction failed', error);
      reply.status(500).send(new Error('Internal Server Error'));
    }
  });

  // -------------------------------------- CRON routes end ---------------------------------------------


  // -------------------------------------- CUSTOM routes start ---------------------------------------------

  //ADD STUFF POST
  fastify.post('/api/gift', (req, reply) => {

    console.log(`gift request: ${JSON.stringify(req.body)}`);

    const updateInventory = async function(client, users, item, count) {
      for (const user of users) {
        if (item !== 'cola') {
          await client.query(`UPDATE inventory SET ${item}= ${item} + ${+count || 1} WHERE tg_id='${user.tg_id}' RETURNING *`);
        }
      }
    }
    
    return fastify.pg.transact(async client => {
      const body = req.body;
      
      if (!body?.secret || body?.secret !== process.env.INVENTORY_SECRET) {
        return reply.status(422).send(new Error('Invalid data'));
      }

      if (!body?.wallets || !body?.wallets?.length) {
        return reply.status(422).send(new Error('Invalid data'));
      }
    
      const users = await client.query(`SELECT users.tg_id, users.wallet_address, inventory.cola FROM users JOIN inventory ON users.tg_id = inventory.tg_id WHERE users.wallet_address IN (${body?.wallets.map(item => `'${item}'`).join(', ')});`);

      if (!users.rows.length) {
        return reply.status(422).send(new Error('Not found'));
      }

      await updateInventory(client, users.rows, body.item, body.count);

      return true;
    })
  });
  
  // -------------------------------------- CUSTOM routes end ---------------------------------------------



  // -------------------------------------- MIGRATIONS routes start ---------------------------------------------

  // INIT TABLE. Launch just once to create the table
  fastify.get('/api/updateDB', (req, reply) => {
    const query = req.query;

    if (!query['secret'] || query['secret'] !== process.env.INVENTORY_SECRET) {
      return reply.status(422).send(new Error('Invalid data'));
    }
    
    return fastify.pg.transact(async client => {
      await client.query('ALTER TABLE inventory ADD nft integer NOT NULL DEFAULT 0');
      await client.query('ALTER TABLE inventory ADD apt integer NOT NULL DEFAULT 0');
      await client.query('ALTER TABLE inventory ADD fomo integer NOT NULL DEFAULT 0');
    });
  });

  // LOOTBOXES
  // fastify.get('/api/lootboxes', (req, reply) => {
  //   return fastify.pg.transact(async client => {
  //     const query = req.query;
  
  //     if (!query['secret'] || query['secret'] !== process.env.INVENTORY_SECRET) {
  //       return reply.status(422).send(new Error('Invalid data'));
  //     }

  //     // Define the loot items with exact counts
  //     const lootCounts = [
  //       { apt: 0.1, fomo: null, nft: null, gold_donut: null, yellow_cola: null, super_cola: null, count: 200 },
  //       { apt: null, fomo: 100000, nft: null, gold_donut: null, yellow_cola: null, super_cola: null, count: 200 },
  //       { apt: null, fomo: null, nft: null, gold_donut: 1, yellow_cola: null, super_cola: null, count: 400 },
  //       { apt: null, fomo: null, nft: null, gold_donut: 2, yellow_cola: null, super_cola: null, count: 200 },
  //       { apt: null, fomo: null, nft: null, gold_donut: 3, yellow_cola: null, super_cola: null, count: 100 },
  //       { apt: null, fomo: null, nft: null, gold_donut: null, yellow_cola: 1, super_cola: null, count: 500 },
  //       { apt: null, fomo: null, nft: null, gold_donut: null, yellow_cola: 2, super_cola: null, count: 200 },
  //       { apt: null, fomo: null, nft: null, gold_donut: null, yellow_cola: 3, super_cola: null, count: 100 },
  //       { apt: null, fomo: null, nft: null, gold_donut: null, yellow_cola: null, super_cola: 1, count: 400 },
  //       { apt: null, fomo: null, nft: null, gold_donut: null, yellow_cola: null, super_cola: 2, count: 200 },
  //       { apt: null, fomo: null, nft: null, gold_donut: null, yellow_cola: null, super_cola: 3, count: 100 },
  //       { apt: null, fomo: null, nft: null, gold_donut: null, yellow_cola: null, super_cola: null, count: 1500 }, // Empty Box
  //       { apt: 1, fomo: null, nft: null, gold_donut: null, yellow_cola: null, super_cola: null, count: 10 },
  //       { apt: 10, fomo: null, nft: null, gold_donut: null, yellow_cola: null, super_cola: null, count: 1 },
  //       { apt: null, fomo: 50000, nft: null, gold_donut: null, yellow_cola: null, super_cola: null, count: 500 },
  //       { apt: null, fomo: 75000, nft: null, gold_donut: null, yellow_cola: null, super_cola: null, count: 200 },
  //       { apt: null, fomo: 150000, nft: null, gold_donut: null, yellow_cola: null, super_cola: null, count: 100 },
  //       { apt: null, fomo: 300000, nft: null, gold_donut: null, yellow_cola: null, super_cola: null, count: 64 },
  //       { apt: null, fomo: null, nft: 'NFT', gold_donut: null, yellow_cola: null, super_cola: null, count: 25 },
  //     ];

  //     // Create NFT IDs
  //     const nftIDs = Array.from({ length: 25 }, (_, i) => i + 1);
  
  //     // Function to shuffle an array
  //     function shuffle(array) {
  //       for (let i = array.length - 1; i > 0; i--) {
  //         const j = Math.floor(Math.random() * (i + 1));
  //         [array[i], array[j]] = [array[j], array[i]];
  //       }
  //       return array;
  //     }

  //     async function generateAndInsertLootboxes() {
  //       const lootboxes = [];
      
  //       // Generate rows for each loot item
  //       lootCounts.forEach(item => {
  //         for (let i = 0; i < item.count; i++) {
  //           const lootbox = {
  //             apt: item.apt,
  //             fomo: item.fomo,
  //             nft: null,
  //             gold_donut: item.gold_donut,
  //             yellow_cola: item.yellow_cola,
  //             super_cola: item.super_cola,
  //           };
      
  //           // Assign NFT IDs if applicable
  //           if (item.nft === 'NFT') {
  //             if (nftIDs.length > 0) {
  //               lootbox.nft = nftIDs.pop();
  //             } else {
  //               continue; // Skip if no NFT IDs are left
  //             }
  //           }
      
  //           lootboxes.push(lootbox);
  //         }
  //       });
      
  //       // Shuffle the lootboxes array
  //       shuffle(lootboxes);
      
  //       try {
  //         await client.query('BEGIN');
      
  //         for (const lootbox of lootboxes) {
  //           const query = `
  //             INSERT INTO lootboxes (apt, fomo, nft, gold_donut, yellow_cola, super_cola)
  //             VALUES ($1, $2, $3, $4, $5, $6)
  //           `;
      
  //           const values = [
  //             lootbox.apt || null,
  //             lootbox.fomo || null,
  //             lootbox.nft || null,
  //             lootbox.gold_donut || null,
  //             lootbox.yellow_cola || null,
  //             lootbox.super_cola || null,
  //           ];
      
  //           await client.query(query, values);
  //         }
      
  //         await client.query('COMMIT');
  //         console.log('Lootboxes generated and inserted successfully');
  //       } catch (err) {
  //         await client.query('ROLLBACK');
  //         console.error('Error generating or inserting lootboxes:', err);
  //       } finally {
  //         await client.end();
  //       }
  //     }
      
  //     generateAndInsertLootboxes();
  //   });

  //   // const query = req.query;

  //   // if (!query['secret'] || query['secret'] !== process.env.INVENTORY_SECRET) {
  //   //   return reply.status(422).send(new Error('Invalid data'));
  //   // }
    
  //   // return fastify.pg.transact(async client => {
  //   //   await client.query('CREATE TABLE IF NOT EXISTS "transactions" ("wallet_address" varchar(250),"date" BIGINT,"amount" INTEGER NOT NULL DEFAULT 0, "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW());');
  //   //   await client.query('ALTER TABLE inventory ADD yellow_cola integer NOT NULL DEFAULT 0');
  //   // });
  // });
  // -------------------------------------- MIGRATIONS routes end ---------------------------------------------
}
  
module.exports = routes;