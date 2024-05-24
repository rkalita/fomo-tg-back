
const token = '7081527848:AAEXyXGNqhz-0pXozutq2RNwv4PAK-xDnmo';
const webAppUrl = 'https://tg-tap-app.web.app';
const { Telegraf, Markup } = require('telegraf');
const { message } = require('telegraf/filters');
const { AccountAddress } = require('@aptos-labs/ts-sdk');
const request = require('request');

const bot = new Telegraf(process.env.BOT_TOKEN)

let userInfo;

bot.command('start', (ctx) => {
    userInfo = ctx.chat;

    

    request.post(
        `http://0.0.0.0:3000/api/users`,
        { json: { tg_id: userInfo?.id, tg_username: userInfo?.username } },
        function (error, response, body) {
            if (!error && response.statusCode == 200) {
                ctx.replyWithHTML(`Hello! Click on the 'Open app' button below to launch the application \nWrite <code>/setWallet your_wallet_address</code> to set you Aptos wallet in application`,
                Markup.inlineKeyboard([
                    Markup.button.webApp('Open app', `${webAppUrl}/tap?tg_id=${userInfo?.id}&tg_username=${userInfo.username}`),
                ]),);
                // ctx.reply(
                //     `Hello! Click on the 'Open app' button below to launch the application 
                //     Write "/setWallet your_wallet_address" to set you Aptos wallet in application`,
                //     Markup.inlineKeyboard([
                //         Markup.button.webApp('open app', `${webAppUrl}/tap?tg_id=${userInfo?.id}&tg_username=${userInfo.username}`),
                //     ]),
                // )
                ctx.replyWithPhoto({ source: ctx.chat?.photo?.big_file_id });
            } else {
                ctx.reply(`Something went wrong`);
            }
        }
    );
});

bot.command('setWallet', (ctx) => {
    if (ctx.args.length) {
        if (AccountAddress.isValid({input: ctx.args[0]}).valid) {

            request.post(
                `http://0.0.0.0:3000/api/wallet`,
                { json: { wallet_address: ctx.args[0], tg_id: ctx.chat.id } },
                function (error, response, body) {
                    if (!error && response.statusCode == 200) {
                        ctx.reply(`Your wallet address is noted: ${JSON.stringify(ctx.args[0])}`);
                    } else {
                        ctx.reply(`Something went wrong`);
                    }
                }
            );
        } else {
            ctx.reply(`Invalid wallet address`)
        }
    } else {
        ctx.reply(`Type: /setWallet your_wallet_address`);
    }
});

bot.on(message('web_app_data'), async (ctx) => {
    const data = ctx.webAppData?.data.json();

    if (data?.feedback) {
        ctx.reply(`Your feedback message: ${JSON.stringify(data)}` ?? 'empty message')
    }
});

bot.launch();