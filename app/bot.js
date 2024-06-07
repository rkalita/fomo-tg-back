
const token = '7081527848:AAEXyXGNqhz-0pXozutq2RNwv4PAK-xDnmo';
const webAppUrl = process.env.ALLOW_ORIGIN;
const { Telegraf, Markup } = require('telegraf');
const { message } = require('telegraf/filters');
const { AccountAddress } = require('@aptos-labs/ts-sdk');
const request = require('request');

const bot = new Telegraf(process.env.BOT_TOKEN)
// Store user CAPTCHA data
const captchaData = {};
const refCode = {};

function generateCaptcha() {
    const num1 = Math.floor(Math.random() * 10);
    const num2 = Math.floor(Math.random() * 10);
    const donuts1 = '🍩'.repeat(num1);
    const donuts2 = '🍩'.repeat(num2);
    const question = `How many donuts are there?\n\n${donuts1} ${num1 && num2 ? '+' : ''} ${donuts2 || 0}`;
    const answer = num1 + num2;
    return { question, answer };
}

async function sendMessageToChat(chatId, message) {
    try {
        await bot.telegram.sendMessage(chatId, message, { parse_mode: 'HTML' });
        console.log(`Message sent successfully to chat ID: ${chatId}`);
    } catch (error) {
        console.error(`Error sending message to chat ID ${chatId}:`, error);
    }
}

bot.start((ctx) => {
    const { question, answer } = generateCaptcha();
    
    refCode[ctx.from.id] = ctx.message.text.split(' ')[1];
    captchaData[ctx.from.id] = answer; // Store answer for the user
    
    ctx.replyWithPhoto('https://aptosfomo-c4ea4.web.app/img/FOMSFIELD.png', { caption: `Welcome to Fomsfield, where even cats are crazy for donuts! Before we proceed, please solve this \nCAPTCHA:\n\n${question}` });
});

bot.command('setwallet', (ctx) => {
    if (ctx.args.length) {
        if (AccountAddress.isValid({input: ctx.args[0]}).valid) {

            request.post(
                `http://0.0.0.0:3000/api/wallet`,
                { json: { wallet_address: ctx.args[0], tg_id: ctx.chat.id } },
                function (error, response, body) {
                    if (!error && response.statusCode == 200) {
                        ctx.replyWithHTML(`Your wallet address is noted!\n\nAnd don't forget to join our socials to keep up with all the news!\n\nX (formerly Twitter):\nhttps://x.com/AptosFomo\n\nTG Group:\nhttps://t.me/aptosfomo\n\n`);
                    } else {
                        ctx.reply(`Something went wrong`);
                    }
                }
            );
        } else {
            ctx.reply(`Invalid wallet address`)
        }
    } else {
        ctx.reply(`Type: /setwallet your_wallet_address`);
    }
});

bot.on(message('web_app_data'), async (ctx) => {
    const data = ctx.webAppData?.data.json();

    if (data?.feedback) {
        ctx.reply(`Your feedback message: ${JSON.stringify(data)}` ?? 'empty message')
    }
});

bot.command('buy', (ctx) => {
    ctx.replyWithHTML(`
    ⚡️How To Buy <b>GOLD DONUTS</b> with $FOMO⚡️
    1) Send min. 1.000.000 (1m) $FOMO to fomo-donut.apt
    2) Launch game. Go to "Explore" and click on "Claim Donuts"
    3) Done
    
    ⚠️IMPORTANT⚠️
    <i>Minimum amount to send is 1million $FOMO (6 gold donuts). You can send any amount with round 
    numbers. For example 1..2...3...4...5... millions fomo. In case if you sent not round amount (ex. 999.999, 
    1.500.000...) = funds will be refunded.</i>
    
    🪙How To Buy $FOMO:🪙
    1) Go to https://baptswap.com/#/swap
    2) Select APT/ APTOS FOMO pair 
    3) Buy amount you want
    
    <i>p.s. Baptswap charging fees from transactions [0.6%]</i>`);
});

// Command handler for /gift
bot.command('gift', (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);

    // Validate and parse arguments
    if (args.length < 4) {
        ctx.reply('Usage: /gift <secret> <wallet1,wallet2,...> <item> <count>');
        return;
    }

    const secret = args[0];
    const wallets = args[1].split(',');
    const item = args[2];
    const count = parseInt(args[3], 10);

    if (isNaN(count)) {
        ctx.reply('The count must be a number.');
        return;
    }

    // Proceed with the logic using the parsed arguments
    ctx.reply(`Received command with arguments:
    Wallets: ${wallets.join(', ')}
    Item: ${item}
    Count: ${count}`);

    request.post(
        `http://0.0.0.0:3000/api/gift`,
        { json: { secret, wallets, item, count } },
        function (error, response, body) {
            if (!error && response.statusCode == 200) {
                ctx.reply(`Updated`);
            } else {
                ctx.reply(`Something went wrong`);
            }
        }
    );
});

// Test
bot.command('mass_mail', (ctx) => {
    request.get(
        `http://0.0.0.0:3000/api/users`,
        function (error, response, body) {
            const delay = 1000 / 30;
            
            if (!error && response.statusCode === 200) {
                const users = JSON.parse(body); // Parse the response body as JSON
                ctx.reply(body[0].tg_id);
                // users.forEach((data, index) => { // Add index as a second parameter
                //     setTimeout(() => {
                //         sendMessageToChat(data?.tg_id, `
                //             ⭐️Out of Golden Donuts? Wanna buy some more? ⭐️

                //             Now it's possible! Type /buy and get easy instructions on how to do it in a few mins!
                //         `);
                //     }, index * delay);
                // });
            } else {
                ctx.reply(`Something went wrong`);
            }
        }
    );
});

// Test
bot.command('give_me_test', (ctx) => {
    const userInfo = ctx.chat;
    
    ctx.reply(
        'Welcome to the test mode',
        Markup.inlineKeyboard([
            Markup.button.webApp('Test me!', `${webAppUrl}/tap?tg_id=${userInfo?.id}&tg_username=${userInfo.username}&mode=give_me_test`),
        ])
    );
});

// Handle text messages
bot.on('text', (ctx) => {
    const userAnswer = parseInt(ctx.message.text, 10);
    const correctAnswer = captchaData[ctx.from.id];
    const referralCode = refCode[ctx.from.id];
    const userInfo = ctx.chat;
    const bodyParams = { tg_id: userInfo?.id, tg_username: userInfo?.username, refCode: referralCode };

    // Reply to the user https://t.me/tg_tap_bot?start=REFERRAL_CODE
    if (referralCode) {
        bodyParams['refCode'] = referralCode;
    }
  
    if (userAnswer === correctAnswer) {
      delete captchaData[ctx.from.id];

        return request.post(
            `http://0.0.0.0:3000/api/users`,
            { json: bodyParams },
            function (error, response, body) {

                if (!error && response.statusCode == 200) {
                    ctx.reply(`That's right!\n Click on the 'Open app' button below to launch the application`).then(() => {
                        return ctx.replyWithHTML(`Write <code>/setwallet your_wallet_address</code> (tap to copy) \uD83D\uDCCB to set you Aptos wallet in application`,
                        Markup.inlineKeyboard([
                            Markup.button.webApp('Open app', `${webAppUrl}/tap?tg_id=${userInfo?.id}&tg_username=${userInfo.username}`),
                        ]),);
                    })
                } else {
                    ctx.reply(`Something went wrong`);
                }
            }
        ); // Clear CAPTCHA data for the user
    } else {
      ctx.reply('Incorrect answer. Please try again.');
    }
});

bot.launch();