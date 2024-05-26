
const token = '7081527848:AAEXyXGNqhz-0pXozutq2RNwv4PAK-xDnmo';
const webAppUrl = process.env.ALLOW_ORIGIN;
const { Telegraf, Markup } = require('telegraf');
const { message } = require('telegraf/filters');
const { AccountAddress } = require('@aptos-labs/ts-sdk');
const request = require('request');

const bot = new Telegraf(process.env.BOT_TOKEN)
// Store user CAPTCHA data
const captchaData = {};

function generateCaptcha() {
    const num1 = Math.floor(Math.random() * 10);
    const num2 = Math.floor(Math.random() * 10);
    const donuts1 = '🍩'.repeat(num1);
    const donuts2 = '🍩'.repeat(num2);
    const question = `How many donuts are there?\n\n${donuts1} + ${donuts2}`;
    const answer = num1 + num2;
    return { question, answer };
}


bot.command('start', (ctx) => {
    const { question, answer } = generateCaptcha();
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
        ctx.reply(`Type: /setwallet your_wallet_address`);
    }
});

bot.on(message('web_app_data'), async (ctx) => {
    const data = ctx.webAppData?.data.json();

    if (data?.feedback) {
        ctx.reply(`Your feedback message: ${JSON.stringify(data)}` ?? 'empty message')
    }
});

// Handle text messages
bot.on('text', (ctx) => {
    const userAnswer = parseInt(ctx.message.text, 10);
    const correctAnswer = captchaData[ctx.from.id];
    const userInfo = ctx.chat;;
  
    if (userAnswer === correctAnswer) {
      ;
      delete captchaData[ctx.from.id];

        return request.post(
            `http://0.0.0.0:3000/api/users`,
            { json: { tg_id: userInfo?.id, tg_username: userInfo?.username } },
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