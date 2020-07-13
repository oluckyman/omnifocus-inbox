import {Command, flags} from '@oclif/command'
import * as nodemailer from 'nodemailer'
import {promises as fs} from 'fs'
import * as path from 'path'
import { IConfig } from '@oclif/config'
import cli from 'cli-ux'
import Mail = require('nodemailer/lib/mailer')

const omniFocusEmail = 'example@email.com'
// const myInbox = 'example-2@email.com'

interface Message {
  subject: string
  body?: string
}

class OmnifocusInbox extends Command {
  static description = 'describe the command here'

  static strict = false

  static flags = {
    version: flags.version({char: 'v'}),
    help: flags.help({char: 'h'}),
    body: flags.string({char: 'b'}),
    email: flags.string({char: 'e'}),
  }

  transport!: Mail
  email!: string

  constructor(argv: string[], command: IConfig) {
    super(argv, command)
    this.transport = nodemailer.createTransport({
      host: 'mail.gandi.net',
      secure: true, // use SSL
      port: 465, // port for secure SMTP
      auth: {
        user: 'example@email.com',
        pass: 'SecretPassw0rd',
      },
    })
  }

  async run() {
    const {argv, flags} = this.parse(OmnifocusInbox)
    const subject = argv.join(' ')
    const body = flags.body
    const hasMessage = subject.trim().length > 0
    let addToQueue = false
    this.email = flags.email ?? omniFocusEmail

    if (hasMessage) {
      cli.action.start('Sending')
      await this.send({subject, body})
      .then(() => cli.action.stop())
      .catch((error: any) => {
        if (error.code === 'EDNS') {
          cli.action.stop('no connection')
          addToQueue = true
        }
      })
    }

    // process queue
    //
    const queuePath = path.resolve(process.env.HOME || '', '.of_queue')
    let queue: Message[] = JSON.parse(
      await fs.readFile(queuePath)
      .then(buff => buff.toString())
      .catch(() => {
        this.log('No queue file found', queuePath)
      }) || '[]'
    )

    if (addToQueue) {
      queue.push({subject, body})
      this.log(`Message added to queue (${queue.length} in total)`)
    } else if (queue.length) {
      let sending
      if(hasMessage) {
        sending = `There are messages in queue, sending them too`
      } else {
        sending = `Sending messages from queue`
      }
      const failed: Message[] = []
      let processed = 0
      const bar = cli.progress({ format: `${sending} {value}/{total}` })
      bar.start(queue.length, 0)
      await Promise.all(queue.map((message: Message, i: number) => this.send(message)
        .catch((error) => {
          failed.push(message)
          if (error.code !== 'EDNS') {
            this.log('Message was not sent', error)
          }
        })
        .finally(() => bar.update(++processed))
      ))
      bar.stop()
      if (failed.length) {
        this.log(`I was not able to send ${failed.length} messages. Keeping them in the queue`)
      }
      queue = failed
    }
    await fs.writeFile(queuePath, JSON.stringify(queue))
  }

  send({subject, body}: Message) {
    return this.transport.sendMail({
      from: 'OmniFocus inbox <from@email.com>',
      to: this.email,
      subject,
      text: body,
    })
  }
}

export = OmnifocusInbox
