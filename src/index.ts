import {Command, flags} from '@oclif/command'
import * as nodemailer from 'nodemailer'
import {promises as fs} from 'fs'
import * as path from 'path'
import dotenv from 'dotenv'
import { IConfig } from '@oclif/config'
import cli from 'cli-ux'
import Mail = require('nodemailer/lib/mailer')

dotenv.config({ path: `${__dirname}/../.env` })

const defaultEmail = process.env.EMAIL
const fromAddress = process.env.FROM
const transportHost = process.env.TRANSPORT_HOST
const transportPort = process.env.TRANSPORT_PORT
const transportAuthUser = process.env.TRANSPORT_AUTH_USER
const transportAuthPass = process.env.TRANSPORT_AUTH_PASS
const queuePath = process.env.QUEUE_PATH

interface Message {
  subject: string
  body?: string
}

class OmnifocusInbox extends Command {
  static description = 'Sends a email to specified email. Good for capturing quick notes and ideas into your inbox or OmniFocus inbox'

  static strict = false

  static flags = {
    version: flags.version({char: 'v'}),
    help: flags.help({char: 'h'}),
    body: flags.string({char: 'b', description: 'Body of the message. Wrap in quotes if multiple words'}),
    email: flags.string({char: 'e', description: 'Custom email to send to'}),
  }

  transport!: Mail
  email!: string

  constructor(argv: string[], command: IConfig) {
    super(argv, command)
    this.transport = nodemailer.createTransport({
      host: transportHost ?? 'mail.gandi.net',
      secure: true, // use SSL
      port: +(transportPort ?? 465), // port for secure SMTP
      auth: {
        user: transportAuthUser,
        pass: transportAuthPass,
      },
    })
  }

  async run() {
    const {flags, raw} = this.parse(OmnifocusInbox)
    const parsed = {
      subject: [] as string[],
      body: [] as string[],
    }
    let state: 'subject' | 'body' | 'other' = 'subject'

    raw.forEach(token => {
      if (token.type === 'flag') {
        state = token.flag === 'body' ? 'body' : 'other'
      }
      switch (state) {
        case 'subject':
          parsed.subject.push(token.input)
          break
        case 'body':
          parsed.body.push(token.input)
          break
        case 'other':
          // skip the flag but get back to subject state
          state = 'subject'
          break
      }
    })
    const subject = parsed.subject.join(' ')
    const body = parsed.body.join(' ')
    const hasMessage = subject.trim().length > 0
    let addToQueue = false
    const emailToUse = flags.email ?? defaultEmail
    if (!emailToUse) {
      this.error('Please, specify target email in .env EMAIL or with -e flag')
      cli.action.stop('no email to send to')
      return
    }

    this.email = emailToUse

    if (hasMessage) {
      cli.action.start('Sending')
      await this.send({subject, body})
        .then(() => cli.action.stop())
        .catch((error: any) => {
          if (error.code === 'EDNS') {
            cli.action.stop('no connection')
            addToQueue = true
          } else {
            console.log('Unhandled error', error)
            throw new Error(error)
          }
        })
    }

    // process queue
    //
    const queueFilename = queuePath ?? path.resolve(process.env.HOME || '', '.of_queue')
    let queue: Message[] = JSON.parse(
      await fs.readFile(queueFilename)
        .then(buff => buff.toString())
        .catch(() => {
          this.log('No queue file found', queueFilename)
        }) || '[]'
    )

    if (addToQueue) {
      queue.push({subject, body})
      this.log(`Message added to queue (${queue.length} in total)`)
    } else if (queue.length) {
      let sending
      if(hasMessage) {
        sending = `There are messages in the queue, sending them too`
      } else {
        sending = `Sending messages from the queue`
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
    await fs.writeFile(queueFilename, JSON.stringify(queue))
  }

  send({subject, body}: Message) {
    return this.transport.sendMail({
      from: fromAddress,
      to: this.email,
      subject,
      text: body,
    })
  }
}

export = OmnifocusInbox
