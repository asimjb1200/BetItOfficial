import axios from 'axios';
import nodemailer, { Transporter } from 'nodemailer';

// TODO: Still need to finish going through the code and adding email notifications where necessary
// payouts, refunds and game beginnings all need to have email notifications sent out to them
class EmailHelper {
    #transporter: Transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 587,
        secure: false, // this stays false on all ports but 465
        auth: {
            user: process.env.GMAILUSERNAME!,
            pass: process.env.GMAILPASSWORD!
        }
    });

    private static emailerInstance: EmailHelper;

    public static get EmailHelperInstance() {
        return this.emailerInstance || (this.emailerInstance = new this());
    }

    async testMessage(to: string) {
        let info = await this.#transporter.sendMail({
            from: '"Bet It Crypto Gambling" <support@bet-it-casino.com>',
            to,
            subject: "Your Game Is About To Start!",
            text: "A game you bet on is about to start.",
            html: "<h2>Good Luck!</h2>"
        });

        return info.messageId;
    }

    async emailUser(to: string, subject: string, text: string): Promise<any> {
        return this.#transporter.sendMail({
            from: '"Bet It Crypto Gambling" <support@bet-it-casino.com>',
            to,
            subject,
            text,
            html: "<h2>Good Luck!</h2>"
        });
    }

    async emailSupport(to: string, subject: string, text: string): Promise<any> {
        return this.#transporter.sendMail({
            from: '"Bet It Crypto Gambling" <support@bet-it-casino.com>',
            to,
            subject,
            html: text + "<br><h2>Good Luck!</h2>"
        });
    }

    async sendEmails() {
        let promiseArr = [];
        for (let index = 0; index < 3; index++) {
            let to = 'asimjbrown@gmail.com';
            let subject = `test email number ${index}`;
            let text = `Test number ${index} to see if the promise stuff works`;
            promiseArr.push(this.emailUser(to, subject, text));
        }

        let sentAll = await Promise.all(promiseArr);
        return sentAll;
    }
}

export const emailHelper = EmailHelper.EmailHelperInstance