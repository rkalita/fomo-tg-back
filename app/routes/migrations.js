async function routes(fastify, options) {

    // INIT TABLE. Launch just once to create the table
    fastify.get('/api/initDB', (req, reply) => {
        return fastify.pg.transact(async client => {

            await client.query('CREATE TABLE IF NOT EXISTS "users" ("tg_id" varchar(250) PRIMARY KEY,"tg_username" varchar(250),"wallet_address" varchar(250) UNIQUE,"score" integer, "energy" integer NOT NULL DEFAULT 0, referral_code VARCHAR(20) UNIQUE, "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "first_day_drink" TIMESTAMPTZ, last_taps_count integer NOT NULL DEFAULT 0, captcha_rewarded_at TIMESTAMPTZ, event_score integer default 0, joined_to_event BOOLEAN DEFAULT false);');
            await client.query('CREATE TABLE IF NOT EXISTS "inventory" ("tg_id" varchar(250) PRIMARY KEY,"cola" integer NOT NULL DEFAULT 0,"super_cola" integer NOT NULL DEFAULT 0,"yellow_cola" integer NOT NULL DEFAULT 0,"donut" integer NOT NULL DEFAULT 0,"gold_donut" integer NOT NULL DEFAULT 0, "lootbox" integer NOT NULL DEFAULT 0, "nft" integer NOT NULL DEFAULT 0, "exclusive_nft" integer NOT NULL DEFAULT 0, "apt" DECIMAL(10, 2) NOT NULL DEFAULT 0, "fomo" bigint NOT NULL DEFAULT 0, "dumdum" bigint NOT NULL DEFAULT 0);');
            await client.query('CREATE TABLE IF NOT EXISTS "refs" ("referral_id" varchar(250),"referrer_id" varchar(250) UNIQUE,"rewarded" TIMESTAMPTZ,"created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW());');
            await client.query('CREATE TABLE IF NOT EXISTS "transactions" ("wallet_address" varchar(250),"date" BIGINT,"amount" INTEGER NOT NULL DEFAULT 0, "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW());');
            await client.query('CREATE TABLE IF NOT EXISTS "lootboxes" (id SERIAL PRIMARY KEY, apt DECIMAL(10, 2), fomo BIGINT, dumdum BIGINT, nft integer, exclusive_nft integer, donut BIGINT, gold_donut INTEGER, yellow_cola INTEGER,super_cola INTEGER, tg_id varchar(250), rewarded BOOLEAN DEFAULT false, opened_at TIMESTAMPTZ);');
            await client.query('CREATE TABLE IF NOT EXISTS "nfts" (id SERIAL PRIMARY KEY, title varchar(250));');
            await client.query('CREATE TABLE IF NOT EXISTS "exclusive_nfts" (id SERIAL PRIMARY KEY, title varchar(250));');
            await client.query('CREATE TABLE IF NOT EXISTS "users_hash" ("tg_id" varchar(250), hash varchar(250), "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW());');
            await client.query('CREATE TABLE IF NOT EXISTS "events" (id SERIAL PRIMARY KEY, name varchar(250), super_cola integer NOT NULL DEFAULT 0, start_at TIMESTAMPTZ, finish_at TIMESTAMPTZ, finished BOOLEAN DEFAULT false);');
            await client.query('CREATE TABLE IF NOT EXISTS "users_events" (tg_id varchar(250), event_id integer, joined_at TIMESTAMPTZ, score integer);');

            //INDEXES
            await client.query('CREATE INDEX IF NOT EXISTS idx_users_tg_id ON users (tg_id);');
            await client.query('CREATE INDEX IF NOT EXISTS idx_users_score ON users (score);');
            await client.query('CREATE INDEX IF NOT EXISTS idx_inventory_tg_id ON inventory (tg_id);');
            await client.query('CREATE INDEX IF NOT EXISTS idx_refs_referrer_id ON refs (referrer_id);');
            await client.query('CREATE INDEX IF NOT EXISTS idx_refs_rewarded ON refs (rewarded);');

            return true;
        })
    });
    
    fastify.get('/api/updateDB', async (req, reply) => {
        const query = req.query;

        if (!query['secret'] || query['secret'] !== process.env.INVENTORY_SECRET) {
            return reply.status(422).send(new Error('Invalid data'));
        }

        return fastify.pg.transact(async client => {

            await client.query('UPDATE users SET event_score = 0');
            await client.query('CREATE TABLE IF NOT EXISTS "events" (id SERIAL PRIMARY KEY, name varchar(250), start_at TIMESTAMPTZ, finish_at TIMESTAMPTZ, finished BOOLEAN DEFAULT false);');
            await client.query('CREATE TABLE IF NOT EXISTS "users_events" (tg_id varchar(250), event_id integer, joined_at TIMESTAMPTZ, score integer);');
            await client.query('ALTER TABLE users ADD COLUMN joined_to_event BOOLEAN DEFAULT false');

            return true;
        })
    });

    // LOOTBOXES
    fastify.get('/api/lootboxes-insert', (req, reply) => {
        return fastify.pg.transact(async client => {
            const query = req.query;

            if (!query['secret'] || query['secret'] !== process.env.INVENTORY_SECRET) {
                return reply.status(422).send(new Error('Invalid data'));
            }

            // Define the loot items with exact counts
            const lootCounts = [
                { apt: 0.1, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 200 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: 1000, count: 8 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: 165, count: 192 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: 1, yellow_cola: null, super_cola: null, dumdum: null, count: 400 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: 2, yellow_cola: null, super_cola: null, dumdum: null, count: 200 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: 3, yellow_cola: null, super_cola: null, dumdum: null, count: 100 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: 1, super_cola: null, dumdum: null, count: 500 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: 2, super_cola: null, dumdum: null, count: 200 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: 3, super_cola: null, dumdum: null, count: 100 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: 1, dumdum: null, count: 400 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: 2, dumdum: null, count: 200 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: 3, dumdum: null, count: 100 },
                { apt: null, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 1500 }, // Empty Box
                { apt: 1, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 10 },
                { apt: 10, fomo: null, nft: null, donut:null, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 1 },
                { apt: null, fomo: null, nft: null, donut:50000, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 500 },
                { apt: null, fomo: null, nft: null, donut:75000, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 200 },
                { apt: null, fomo: null, nft: null, donut:150000, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 100 },
                { apt: null, fomo: null, nft: null, donut:300000, gold_donut: null, yellow_cola: null, super_cola: null, dumdum: null, count: 64 },
            ];

            // Function to shuffle an array
            function shuffle(array) {
                for (let i = array.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [array[i], array[j]] = [array[j], array[i]];
                }
                return array;
            }

            async function generateAndInsertLootboxes() {
                const lootboxes = [];

                // Generate rows for each loot item
                lootCounts.forEach(item => {
                for (let i = 0; i < item.count; i++) {
                    const lootbox = {
                    apt: item.apt,
                    fomo: item.fomo,
                    nft: null,
                    gold_donut: item.gold_donut,
                    donut: item.donut,
                    yellow_cola: item.yellow_cola,
                    super_cola: item.super_cola,
                    dumdum: item.dumdum
                    };

                    lootboxes.push(lootbox);
                }
                });

                // Shuffle the lootboxes array
                shuffle(lootboxes);

                try {
                await client.query('BEGIN');

                for (const lootbox of lootboxes) {
                    const query = `
                    INSERT INTO lootboxes (apt, fomo, nft, gold_donut, yellow_cola, super_cola, donut, dumdum)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    `;

                    const values = [
                    lootbox.apt || null,
                    lootbox.fomo || null,
                    lootbox.nft || null,
                    lootbox.gold_donut || null,
                    lootbox.yellow_cola || null,
                    lootbox.super_cola || null,
                    lootbox.donut || null,
                    lootbox.dumdum || null,
                    ];

                    await client.query(query, values);
                }

                await client.query('COMMIT');
                console.log('Lootboxes generated and inserted successfully');
                } catch (err) {
                await client.query('ROLLBACK');
                console.error('Error generating or inserting lootboxes:', err);
                } finally {
                await client.end();
                }
            }

            generateAndInsertLootboxes();
        });
    });
}
    
module.exports = routes;