
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
    const question = `How many donuts are there?\n\n${donuts1} ${num1 && num2 ? '+' : ''} ${donuts2 || ''}`;
    const answer = num1 + num2;
    return { question, answer };
}

async function sendMessageToChat(chatId, message) {
    try {
        await bot.telegram.sendMessage(chatId, message, { 
            parse_mode: 'HTML',
            reply_markup: {
                keyboard: [
                    [
                        Markup.button.webApp('Open App', `${webAppUrl}/tap?tg_id=${chatId}`)
                    ]
                ],
                resize_keyboard: true,
                one_time_keyboard: false
            }
        });
        console.log(`Message sent successfully to chat ID: ${chatId}`);
    } catch (error) {
        console.error(`Error sending message to chat ID ${chatId}:`, error);
    }
}

bot.start((ctx) => {
    const payload = ctx.message.text.split(' ')[1]; // Extract the payload from the /start command

    if (payload && payload.startsWith('auth_')) {
        const hash = payload.split('_')[1];

        request.put(
            `http://0.0.0.0:3000/api/users-hash`,
            { json: { hash, tg_id: ctx.chat.id } },
            function (error, response, body) {
                if (!error) {
                    ctx.replyWithHTML(`You've been authenticated in FOMO TAP. Now you can turn back to your browser`);
                } else {
                    ctx.reply(`Something went wrong`);
                }
            }
        );
    } else {
        request.get(
            `http://0.0.0.0:3000/api/users/${ctx.chat.id}`,
            function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    ctx.reply(`You've already been registered.`, { 
                        parse_mode: 'HTML',
                        reply_markup: {
                            keyboard: [
                                [
                                    Markup.button.webApp('Open App', `${webAppUrl}/tap?tg_id=${ctx.chat.id}`)
                                ]
                            ],
                            resize_keyboard: true,
                            one_time_keyboard: false
                        }
                    });
                } else {
                    const { question, answer } = generateCaptcha();
        
                    refCode[ctx.from.id] = ctx.message.text.split(' ')[1];
                    captchaData[ctx.from.id] = answer; // Store answer for the user
                    
                    ctx.replyWithPhoto('https://aptosfomo-c4ea4.web.app/img/FOMSFIELD.png', { caption: `Welcome to Fomsfield, where even cats are crazy for donuts! Before we proceed, please solve this \nCAPTCHA:\n\n${question}` });
                }
            }
        );
    }
});

bot.command('setwallet', (ctx) => {
    if (ctx.args.length) {
        if (AccountAddress.isValid({input: ctx.args[0]}).valid) {

            request.post(
                `http://0.0.0.0:3000/api/wallet`,
                { json: { wallet_address: ctx.args[0], tg_id: ctx.chat.id } },
                function (error, response, body) {
                    if (!error && response.statusCode == 200) {
                        ctx.replyWithHTML(`Your wallet address is noted!\n\nAnd don't forget to join our socials to keep up with all the news!\n\nX (formerly Twitter):\nhttps://x.com/AptosFomo\n\nTG Group:\nhttps://t.me/aptosfomo\n\n`, { disable_web_page_preview: true });
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
    1) Go to https://app.panora.exchange/swap?pair=APT_FOMO
    2) Select APT/ APTOS FOMO pair 
    3) Buy amount you want`,
    { disable_web_page_preview: true }
    );
});

bot.command('faq', (ctx) => {
    ctx.replyWithHTML(`
        F.A.Q About our game [EN]
https://telegra.ph/Fomo-Tap-App-FAQ-06-02#How%20to%20play

Часто задаваемые вопросы о нашей игре [RU]
https://telegra.ph/Fomo-Tap-App-FAQ-RU-06-03`
    );
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

// CLEAR EVENT SCORE
bot.command('event_start', (ctx) => {
    // Extract the entire message text after the command
    const messageText = ctx.message.text;

    // Split the message text by the first space to separate the command and the rest
    const firstSpaceIndex = messageText.indexOf(' ');
    if (firstSpaceIndex === -1) {
        ctx.reply('Invalid command format. (/event_start <secret key> <name of the event>)');
        return;
    }

    // Extract the command, secret_key and the rest as text
    const command = messageText.substring(0, firstSpaceIndex).trim();
    const remainingText = messageText.substring(firstSpaceIndex + 1).trim();

    // Split the remaining text into secret_key and text
    const parts = remainingText.split(' ');
    if (parts.length < 2) {
        ctx.reply('Please provide a secret_key and some text.');
        return;
    }

    // Extract the secret_key (first part) and the rest as text
    const secret = parts[0];
    const name = parts.slice(1).join(' ');

    const bodyParams = { secret, name };

    return request.post(
        `http://0.0.0.0:3000/api/event-create`,
        { json: bodyParams },
        function (error, response, body) {
            if (!error) {
                ctx.reply(`Event has been created and started`);
            } else {
                ctx.reply(`Something went wrong: ${error}`);
            }
        }
    );

});

bot.command('event_stop', (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    const secret = args[0];

    if (!secret) {
        ctx.reply('Invalid command format. (/event_stop <secret key>)');
        return;
    }

    return request.get(
        `http://0.0.0.0:3000/api/eventCheck?secret=${secret}`,
        function (error, response, body) {
            if (!error) {
                ctx.reply(response?.body);
            } else {
                ctx.reply(`Something went wrong: ${error}`);
            }
        }
    );
})

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

// USERS COUNT
bot.command('users', (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    const option = args[0]; //wallets | score | event | refs | refs_rewarded
    const param = args[1];

    if (option === 'help') {
        return ctx.replyWithHTML(`
                        Usage - /users {wallets/score/event/refs/refs_rewarded} params

Options:

wallets - count of users with wallets

score - count of users with score

event - count of users joined to active event

refs - count of refferers(/users refs ref_code)

refs_rewarded - count of refferers wit rewards(/users refs_rewarded ref_code)
                        `)
    }

    if (!option) {
        return request.get(
            `http://0.0.0.0:3000/api/users-count`,
            function (error, response, body) {
                if (!error) {
                    ctx.reply(response?.body);
                } else {
                    ctx.reply(`Something went wrong: ${error}`);
                }
            }
        );
    }

    if ((option === 'refs' || option === 'refs_rewarded') && !args[1]) {
        ctx.reply('Usage: /users {refs/refs_rewarded} <ref_code>');
        return;
    }
    
    
    return request.get(
        `http://0.0.0.0:3000/api/users-count?${option}=true${param ? '&ref_code=' + param : ''}`,
        function (error, response, body) {
            if (!error) {
                ctx.reply(response?.body);
            } else {
                ctx.reply(`Something went wrong: ${error}`);
            }
        }
    );
});

// LOOTBOXES COUNT
bot.command('lootboxes', (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    const option = args[0]; //opened | closed

    if (option === 'help') {
        return ctx.replyWithHTML(`
                        Usage - /lootboxes {opened/closed}

Options:

opened - count of all opened lootboxes

closed - count of all closed lootboxes
                        `)
    }

    if (option && !['opened','closed'].includes(option)) {
        ctx.reply('Usage: /lootboxes {opened/closed/opened_today}');
        return;
    }
    
    return request.get(
        `http://0.0.0.0:3000/api/lootboxes-count${option ? '?' + option + '=true': ''}`,
        function (error, response, body) {
            if (!error) {
                ctx.reply(response?.body);
            } else {
                ctx.reply(`Something went wrong: ${error}`);
            }
        }
    );
});

// EVENT COMMAND
// bot.command('event', (ctx) => {
//     const args = ctx.message.text.split(' ').slice(1);
//     const option = args[0]; //opened | closed

//     if (option === 'help') {
//         return ctx.replyWithHTML(`Usage - /event {username}`)
//     }
    
//     return request.get(
//         `http://0.0.0.0:3000/api/lootboxes-count${option ? '?' + option + '=true': ''}`,
//         function (error, response, body) {
//             if (!error) {
//                 ctx.reply(response?.body);
//             } else {
//                 ctx.reply(`Something went wrong: ${error}`);
//             }
//         }
//     );
// });

// MASS MAIL
bot.command('mass_mail', (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    const secret = args[0];
    
    if (!secret || secret !== process.env.INVENTORY_SECRET) {
        ctx.reply(`Wrong secret`);
        return;
    }

    request.get(
        `http://0.0.0.0:3000/api/users?unlimit=true`,
        function (error, response, body) {
            const delay = 1000 / 30;

            if (!error && response.statusCode === 200) {
                const users = JSON.parse(body); // Parse the response body as JSON
                users.forEach((user, index) => { // Add index as a second parameter
                    setTimeout(() => {
                        sendMessageToChat(
                            user.tg_id, `
JOIN TO EVENT AND SHARE AMAZING PRIZES! 🔥

How to participate?  
1)Go to "Explore"  
2)Tap on "Join Weekly Event"  
3)Сlimb up the leaderboard using Cola/Super Cola*

*You can buy Super cola with Gold Donuts and $FOMO
                            `);
                    }, index * delay);
                });
            } else {
                ctx.reply(`Something went wrong`);
            }
        }
    );
});

bot.command('test_claim', (ctx) => {
    const userInfo = ctx.chat;

    sendMessageToMe(274490662, `Due to a lot of info you may miss the «Open app» button, so now it’ll always be with you ❤️‍🔥`);
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
                        return ctx.replyWithHTML(`
                        Write <code>/setwallet your_wallet_address</code> (tap to copy) \uD83D\uDCCB to set you Aptos wallet in application

Have not Aptos Wallet yet? Download it now!
https://petra.app/

Type /buy and get easy instructions on how to do it in a few mins!

Type /faq and get step by step manual!
                        `,
                        {
                            disable_web_page_preview: true,
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: 'Open app', web_app: { url: `${webAppUrl}/tap?tg_id=${userInfo?.id}&tg_username=${userInfo.username}` } }]
                                ]
                            }
                        });
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