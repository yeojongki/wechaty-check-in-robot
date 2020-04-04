import * as dotenv from 'dotenv'
import * as path from 'path'

export default class Config {
  static getInstance() {
    if (!Config._instance) {
      Config._instance = new Config()
    }
    return Config._instance
  }

  private static _instance: null | Config = null

  config: Record<string, string>

  constructor() {
    let conf = dotenv.config({ path: path.resolve(__dirname, '..', '.env') })
    if (conf.error) {
      console.error(`🔰[env]: error`, conf.error)
    }
    this.config = conf.parsed || {}
  }

  get(key: string) {
    return this.config[key]
  }

  get WHITE_LIST(): null | string[] {
    const whiteList = this.config['WHITE_LIST']
    if (whiteList) {
      return whiteList.split(',')
    }
    return null
  }

  get PAD_PLUS_TOKEN() {
    return this.config['PAD_PLUS_TOKEN']
  }

  get BOT_NAME() {
    return this.config['BOT_NAME']
  }

  get SCKEY() {
    return this.config['SCKEY']
  }

  get SC_ENABLE() {
    if (Number(this.config['SC_ENABLE']) === 1) {
      return true
    }
    return false
  }

  get ROOM_NAME() {
    return this.config['ROOM_NAME']
  }

  get DB_HOST() {
    return this.config['DB_HOST']
  }

  get DB_PORT() {
    return this.config['DB_PORT']
  }

  get DB_CHARSET() {
    return this.config['DB_CHARSET']
  }

  get DB_USERNAME() {
    return this.config['DB_USERNAME']
  }

  get DB_PASSWORD() {
    return this.config['DB_PASSWORD']
  }

  get DB_NAME() {
    return this.config['DB_NAME']
  }

  get WEBHOOK_PORT() {
    return this.config['WEBHOOK_PORT']
  }

  get WEBHOOK_PATH() {
    return this.config['WEBHOOK_PATH']
  }

  get WEBHOOK_SECRET() {
    return this.config['WEBHOOK_SECRET']
  }
}
