import {Command, flags} from '@oclif/command'

class OmnifocusInbox extends Command {
  static description = 'describe the command here'

  static strict = false

  static flags = {
    version: flags.version({char: 'v'}),
    help: flags.help({char: 'h'}),
  }

  async run() {
    const {argv} = this.parse(OmnifocusInbox)
    const body = argv.join(' ')
    // send the body to OF email
    this.log(body)
  }
}

export = OmnifocusInbox
