async function routes(fastify, options) {
    // Testing route
    fastify.get('/', async (request, reply) => {
      return { hello: 'world' };
    });
  
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
        await client.query('CREATE TABLE IF NOT EXISTS "inventory" ("tg_id" varchar(250) PRIMARY KEY,"cola" integer NOT NULL DEFAULT 0,"super_cola" integer NOT NULL DEFAULT 0,"donut" integer NOT NULL DEFAULT 0,"gold_donut" integer NOT NULL DEFAULT 0);');
        await client.query('CREATE TABLE IF NOT EXISTS "refs" ("referral_id" varchar(250),"referrer_id" varchar(250) UNIQUE,"rewarded" TIMESTAMPTZ,"created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW());');

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
    fastify.get('/api/users/:id', (req, reply) => {
      return fastify.pg.transact(async client => {

        let user = await client.query(`SELECT users.tg_id, users.tg_username, users.wallet_address, users.score, users.energy, users.first_day_drink, users.referral_code, inventory.cola, inventory.super_cola, inventory.donut, inventory.gold_donut from users INNER JOIN inventory ON users.tg_id = inventory.tg_id WHERE users.tg_id = '${req.params.id}'`);
        const position = await client.query(`WITH ranked_table AS (SELECT *, ROW_NUMBER() OVER (ORDER BY score DESC, users.tg_username) AS row_num FROM "users") SELECT row_num FROM ranked_table WHERE "tg_id" = '${req.params.id}';`);
        const invited = await client.query(`SELECT COUNT(*) AS count FROM refs WHERE referral_id='${req.params.id}'`)

        if (user.rows[0].cola < 4 && user.rows[0].first_day_drink) {
          // Define differrence between now and first drink cola in day
          const firstDayDrinkDateTime = new Date(user.rows[0].first_day_drink);
          const currentDate = new Date();
          const timeDifferenceHours = (currentDate - firstDayDrinkDateTime) / (1000 * 60 * 60);

          if (timeDifferenceHours >= 6) {
            const recoveredBottlesCount = Math.floor(timeDifferenceHours / 6);

            const inventory = await client.query(`UPDATE inventory
              SET cola = CASE
                WHEN cola + ${recoveredBottlesCount} <= 4 THEN cola + ${recoveredBottlesCount}
                ELSE 4
              END
              WHERE tg_id = '${req.params.id}' RETURNING *;`);
            
              await client.query(`UPDATE users SET first_day_drink = first_day_drink + INTERVAL '6 hours' WHERE tg_id = '${req.params.id}';`);

            user.rows[0].cola = inventory.rows[0].cola;
          }
        }
    
        return {...user.rows[0], rate: +position.rows[0].row_num, invited: +invited.rows[0].count};
      })
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
    
          return users.rows[0];
        }
    
        return userExists.rows[0];
      })
    });

    //GULP
    fastify.patch('/api/gulp/:tg_id', (request, reply) => {
      return fastify.pg.transact(async client => {

        const gulpItems = request.body;
        let user = null;
        let inventory = null;

        if (gulpItems.item === 'cola') {
          inventory = await client.query(`UPDATE inventory
          SET cola = CASE
              WHEN cola - 1 < 0 THEN 0
              ELSE cola - 1
          END
          WHERE tg_id = '${request.params.tg_id}' RETURNING *;`);

          user = await client.query(`UPDATE users
            SET energy = CASE
                WHEN energy + 25 <= 100 THEN energy + 25
                ELSE 100
            END,
            first_day_drink = CASE
                WHEN first_day_drink IS NULL THEN NOW()
                WHEN first_day_drink <= NOW() - INTERVAL '24 hours' THEN NOW()
                ELSE first_day_drink
            END
            WHERE tg_id = '${request.params.tg_id}' RETURNING tg_username, wallet_address, score, energy;`);
        } else if (gulpItems.item === 'super_cola') {

          user = await client.query(`UPDATE users SET energy = 100 
            WHERE tg_id = '${request.params.tg_id}' 
            RETURNING tg_username, wallet_address, score, energy;`);

          inventory = await client.query(`UPDATE inventory
            SET super_cola = CASE
              WHEN super_cola - 1 < 0 THEN 0
              ELSE super_cola - 1
            END
            WHERE tg_id = '${request.params.tg_id}' RETURNING *;`);
        }
    
        return {...user.rows[0], ...inventory.rows[0]}
      })
    });
  
    //TAP
    fastify.patch('/api/tap/:tg_id', (req, reply) => {
      return fastify.pg.transact(async client => {
        let taps = req.body.taps;
      
        let user = await client.query(`SELECT users.score, users.energy FROM users WHERE users.tg_id='${req.params.tg_id}'`);
        let inventory = await client.query(`SELECT inventory.donut, inventory.gold_donut FROM inventory WHERE inventory.tg_id='${req.params.tg_id}'`);

        if (+taps > user.rows[0].energy) {
          taps = +user.rows[0].energy;
          reply.status(422).send(new Error('Invalid data'));
        }

        inventory = await client.query(`UPDATE inventory SET donut=${inventory.rows[0].donut + +taps * 1000} WHERE tg_id='${req.params.tg_id}' RETURNING cola, super_cola, donut, gold_donut`);
    
        user = await client.query(`UPDATE users SET score=${user.rows[0].score + +taps * 1000}, energy=${user.rows[0].energy - taps}, last_taps_count=${taps}, updated_at = NOW() WHERE tg_id = '${req.params.tg_id}' RETURNING tg_id, tg_username, wallet_address, score, energy, referral_code`);

        return {...user.rows[0], ...inventory.rows[0]}
      })
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
      
    //ADD STUFF GET
    fastify.get('/api/inventory/:wallet_address', (req, reply) => {
      return fastify.pg.transact(async client => {
        const query = req.query;

        if (!req.params.wallet_address) {
          return reply.status(422).send(new Error('Invalid data'));
        }

        
        if (!query['secret'] || query['secret'] !== process.env.INVENTORY_SECRET) {
          return reply.status(422).send(new Error('Invalid data'));
        }
      
        const user = await client.query(`SELECT tg_id FROM users WHERE wallet_address='${req.params.wallet_address}'`);

        if (!user.rows.length) {
          return reply.status(422).send(new Error('Not found'));
        }

        const inventory = await client.query(`SELECT cola FROM inventory WHERE tg_id='${user.rows[0].tg_id}'`);

        if (query['item'] == 'cola' && ((inventory.rows[0].cola + +query['count']) > 4)) {
          return reply.status(422).send(new Error('Cola cannot be more than 4 in sum'));
        }

        const inventoryUpdate = await client.query(`UPDATE inventory SET ${query['item']}= ${query['item']} + ${+query['count'] || 1} WHERE tg_id='${user.rows[0].tg_id}' RETURNING *`);

        return inventoryUpdate.rows[0];
      })
    });

    //ADD STUFF PATCH
    fastify.patch('/api/gift', (req, reply) => {

      const updateInventory = async function(client, users, item, count) {
        for (const user of users) {
          if (item !== 'cola') {
            await client.query(`UPDATE inventory SET ${item}= ${item} + ${+count || 1} WHERE tg_id='${user.tg_id}' RETURNING *`);
          }
        }
      }
      
      return fastify.pg.transact(async client => {
        const body = req.body;

        console.log(`gift request: ${JSON.stringify(req)}`);
        
        if (!body?.secret || body?.secret !== process.env.INVENTORY_SECRET) {
          return reply.status(422).send(new Error('Invalid data'));
        }

        if (!body?.wallets || !body?.wallets?.length) {
          return reply.status(422).send(new Error('Invalid data'));
        }
      
        const users = await client.query(`SELECT users.tg_id, users.wallet_address, inventory.cola FROM users JOIN inventory ON users.tg_id = inventory.tg_id WHERE users.wallet_address IN '${body?.wallets.map(item => `'${item}'`).join(', ')}'`);

        if (!users.rows.length) {
          return reply.status(422).send(new Error('Not found'));
        }

        await updateInventory(client, users.rows, body.item, body.count);

        return true;
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


    // INITERNAL REF REWARDS CHECKER
    fastify.get('/api/refCheck', (req, reply) => {
      const query = req.query;

      if (!query['secret'] || query['secret'] !== process.env.INVENTORY_SECRET) {
        return reply.status(422).send(new Error('Invalid data'));
      }
      
      return fastify.pg.transact(async client => {

        await client.query(`WITH eligible_referrers AS (
          SELECT refs.referral_id, COUNT(*) AS referrers_count
          FROM refs
          JOIN users ON refs.referrer_id = users.tg_id
          WHERE users.score >= 100000 AND refs.rewarded IS NULL
        )
        UPDATE inventory
        SET donut = donut + (25000 * eligible_referrers.referrers_count)
        FROM eligible_referrers
        WHERE inventory.tg_id = eligible_referrers.referral_id;`);

        await client.query(`WITH eligible_referrers AS (
          SELECT refs.referral_id
          FROM refs
          JOIN users ON refs.referrer_id = users.tg_id
          WHERE users.score >= 100000 AND refs.rewarded IS NULL
        )
        UPDATE refs
        SET rewarded = NOW()
        FROM eligible_referrers
        WHERE refs.referral_id = eligible_referrers.referral_id;`);
    
        return true;
      });
    });

    // INIT TABLE. Launch just once to create the table
    fastify.get('/api/updateDB', (req, reply) => {
      const query = req.query;

      if (!query['secret'] || query['secret'] !== process.env.INVENTORY_SECRET) {
        return reply.status(422).send(new Error('Invalid data'));
      }
      
      const update = async (client, refs) => {
        await Promise.all(refs.rows.map(async ref => {
          const user = await client.query(`UPDATE users SET referral_code = '${btoa(randomString).substring(0, 15)}' WHERE tg_id='${user.tg_id}';`);
        }));
      }

      

      return fastify.pg.transact(async client => {

        const refs = await client.query('SELECT * FROM refs WHERE rewarded IS NULL;');

        await update(client, refs);
    
        return true;
      });
    });
  }
  
  module.exports = routes;