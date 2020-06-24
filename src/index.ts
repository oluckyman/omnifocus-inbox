import {Command, flags} from '@oclif/command'
import * as nodemailer from 'nodemailer'

const omniFocusEmail = 'example@email.com'
// const myInbox = 'example-2@email.com'

class OmnifocusInbox extends Command {
  static description = 'describe the command here'

  static strict = false

  static flags = {
    version: flags.version({char: 'v'}),
    help: flags.help({char: 'h'}),
    body: flags.string({char: 'b'}),
  }

  async run() {
    const {argv, flags} = this.parse(OmnifocusInbox)
    const subject = argv.join(' ')
    const body = flags.body
    if (subject.trim().length === 0) {
      this.log('Nothing to send')
      this.exit()
    }

    this.log('Sending…')
    const transport = await nodemailer.createTransport({
      host: 'mail.gandi.net',
      secure: true, // use SSL
      port: 465, // port for secure SMTP
      auth: {
        user: 'example@email.com',
        pass: 'SecretPassw0rd',
      },
    })

    await transport.sendMail({
      from: 'OmniFocus inbox <from@email.com>',
      to: omniFocusEmail,
      // to: myInbox,
      subject,
      text: body,
    })

    this.log('Done')
  }
}

export = OmnifocusInbox
