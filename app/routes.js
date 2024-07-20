async function routes(fastify, options) {
  const getTransatcions = require('./routes/helpers/transactions.helper');
  const { Aptos, AptosConfig, Network } = require('@aptos-labs/ts-sdk');
  const aptosConfig = new AptosConfig({ network: Network.MAINNET });
  const aptos = new Aptos(aptosConfig);
  const request = require('request');
  const destWalletAddress = '0xf141d0e3815513d23fb0a25a891e61fcf49bde39254c22cd472d3b7c920840ca'; //fomo-donut.apt

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

      if (inventory[gulpItems.item] == 0) {
        reply.status(422).send(new Error(`User have no ${gulpItems.item} in inventory`));
        return;
      }
  
      console.log(`GULP INPUT - User id: ${tg_id}, item: ${gulpItems.item}, cola: ${inventory.cola}, super_cola: ${inventory.super_cola}`);

      const updatedInventoryResult = await client.query(`UPDATE inventory SET ${gulpItems.item} = ${gulpItems.item} - 1 WHERE tg_id = $1 RETURNING *;`, [tg_id]);

      if (gulpItems?.game) {
        const multipliers = {
          'cola': 1,
          'yellow_cola': 1.5,
          'super_cola': 3
        };

        user = await client.query(
          `UPDATE users SET active_game = $1, multiplier = $2 WHERE tg_id = $3 RETURNING *;`, 
          [
            gulpItems.game, 
            multipliers[gulpItems.item],
            tg_id
          ]
        );
      } else {
        switch (gulpItems.item) {
          case 'super_cola':
            user = await client.query('UPDATE users SET energy = 100 WHERE tg_id = $1 RETURNING tg_username, wallet_address, score, energy, joined_to_event;', [tg_id]);
            break;

          case 'yellow_cola':
            user = await client.query(`
              UPDATE users
              SET energy = CASE
                WHEN energy + 50 <= 100 THEN energy + 50
                ELSE 100
              END
              WHERE tg_id = $1
              RETURNING tg_username, wallet_address, score, energy, joined_to_event;`, [tg_id]
            );

            break;
                  
          default:
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
              RETURNING tg_username, wallet_address, score, energy, joined_to_event;`, [tg_id]
            );

            break;
        }
      }
  
      const updatedInventory = updatedInventoryResult.rows[0];
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
  
      const userResult = await client.query('SELECT score, energy, active_game FROM users WHERE tg_id = $1', [tg_id]);
      const user = userResult.rows[0];
  
      if (!user) {
        reply.status(404).send(new Error('User not found'));
        return;
      }
  
      const inventoryResult = await client.query('SELECT donut, gold_donut FROM inventory WHERE tg_id = $1', [tg_id]);
      const inventory = inventoryResult.rows[0];
  
      console.log(`TAPS - User id: ${tg_id}, taps: ${taps}, energy: ${inventory?.energy}`);
  
      if (+taps > user.energy && user.active_game === 'tap') {
        taps = user.energy;
        reply.status(422).send(new Error('Invalid data'));
        return;
      }
  
      const updatedUserResult = await client.query(
        `UPDATE users
         SET score = score + $1,
             energy = energy - $2,
             last_taps_count = ${user.active_game === 'tap' ? +taps : 'last_taps_count - 0'},
             active_game = 'tap',
             multiplier = 1,
             updated_at = NOW(),
             event_score = CASE
                           WHEN joined_to_event THEN event_score + $1
                           ELSE event_score
                           END
         WHERE tg_id = $3
         RETURNING *`,
        [
          user.active_game === 'tap' ? (+taps * 1000) : +taps,
          user.active_game === 'tap' ? +taps : 0, 
          tg_id
        ]
      );
  
      const updatedInventoryResult = await client.query(
        'UPDATE inventory SET donut = donut + $1 WHERE tg_id = $2 RETURNING *',
        [user.active_game === 'tap' ? (+taps * 1000) : +taps, tg_id]
      );
  
      const updatedInventory = updatedInventoryResult.rows[0];
      const updatedUser = updatedUserResult.rows[0];
  
      return { ...updatedUser, ...updatedInventory };
    });
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

  //EVENT JOIN
  fastify.patch('/api/event-join/:tg_id', (request, reply) => {
    return fastify.pg.transact(async client => {
        const { tg_id } = request.params;

        if (!tg_id) {
            return reply.status(400).send({ error: 'tg_id is required' });
        }

        try {
            const activeEvent = await client.query(
                `SELECT * FROM events WHERE (NOW() BETWEEN start_at AND finish_at) AND finished = false`
            );

            if (!activeEvent.rows[0]) {
                return reply.status(404).send({ error: 'No active events found' });
            }

            await client.query(`UPDATE users SET joined_to_event = true WHERE tg_id = $1`, [tg_id]);

            await client.query(
                `INSERT INTO users_events (tg_id, event_id, joined_at, score)
                 VALUES ($1, $2, NOW(), 0)`,
                [tg_id, activeEvent.rows[0].id]
            );

            return reply.send({ event: activeEvent.rows[0], event_ends_at: activeEvent.rows[0].finish_at });
        } catch (error) {
            console.error('Error joining event:', error);
            return reply.status(500).send({ error: 'Internal Server Error' });
        }
    });
  });

  //GOLDEN CLAIM
  fastify.get('/api/claim/:id', async (req, reply) => {
    const updateTransactionsAndInventory = async (transactions, walletAddress, tgId, client, userJoinedToEvent) => {
      let goldenDonutsCount = 0;
      let totalAmount = 0;
      for (const transaction of transactions) {
        if (transaction.amount % 1000000 === 0 && transaction.amount / 1000000 > 0) {
          goldenDonutsCount = (transaction.amount / 1000000) * 6;

          await client.query(
            `INSERT INTO transactions (wallet_address, date, amount) VALUES($1, $2, $3) ON CONFLICT DO NOTHING;`,
            [walletAddress, transaction.timestamp, transaction.amount]
          );
          await client.query(
            `UPDATE inventory SET gold_donut = gold_donut + $1 WHERE tg_id = $2;`,
            [goldenDonutsCount, tgId]
          );

          const activeEvent = await client.query(
            `SELECT * FROM events WHERE (NOW() BETWEEN start_at AND finish_at) AND finished = false`
          );

          if (!activeEvent.rows[0]) {
              return reply.status(404).send({ error: 'No active events found' });
          }

          if (userJoinedToEvent) {
            await client.query('UPDATE users_events set gold_donut=gold_donut + $1 WHERE tg_id=$2 AND event_id = $3', [goldenDonutsCount, tgId, activeEvent.rows[0].id]);
          }

          totalAmount += goldenDonutsCount;
        }
      }

      return totalAmount;
    };
  
    try {
      const userId = req.params.id;
      const client = await fastify.pg.connect();
  
      try {
        const userResult = await client.query('SELECT * FROM users WHERE tg_id = $1', [userId]);
        const user = userResult?.rows[0] || {};
  
        if (!user?.wallet_address) {
          reply.status(404).send({ error: "No wallet found" });
          return;
        }
  
        const existedTransactionsResult = await client.query('SELECT date FROM transactions WHERE wallet_address = $1', [user?.wallet_address]);
        const existedTransactions = existedTransactionsResult?.rows?.map(transaction => transaction?.date);
  
        // Make sure to define the getTransactions function or import it if it's external
        const transactions = await getTransatcions(user?.wallet_address, existedTransactions, aptos, destWalletAddress);

        if (
          !transactions || 
          !transactions.length ||
          !transactions.find(transaction => transaction.amount % 1000000 === 0 && transaction.amount / 1000000 > 0)
        ) {
          reply.status(404).send({ error: "No valid transactions found" });
          return;
        }

        const claimed = await updateTransactionsAndInventory(transactions, user?.wallet_address, userId, client, user?.joined_to_event);
  
        if (claimed) {

          request.patch(
            `http://stb:3001/api/donuts-claimed`,
            { json: { donuts: claimed } },
            function (error, response, body) {
                if (error) {
                    console.log(`Claim request error`);
                }
            }
          );
        }

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
}
  
module.exports = routes;