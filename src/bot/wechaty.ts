import PuppetPadplus from 'wechaty-puppet-padplus'
import { Wechaty, ScanStatus } from 'wechaty'
import QrcodeTerminal from 'qrcode-terminal'
import Messenger from '@/shared/messenger'
import { onError } from './onError'
import Config from '@/config'

const config = Config.getInstance()

const puppet = new PuppetPadplus({
  token: config.PAD_PLUS_TOKEN,
})

const name = config.BOT_NAME

const bot = new Wechaty({
  puppet,
  name, // generate xxxx.memory-card.json and save login data for the next login
})

export const initBot = (): Promise<Wechaty> =>
  new Promise((resolve) => {
    bot
      .on('scan', (qrcode, status) => {
        const qrcodeUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(
          qrcode,
        )}`
        console.log(`Scan QR Code to login: ${status}\n${qrcodeUrl}`)
        if (status === ScanStatus.Waiting) {
          Messenger.send('请扫描二维码登录: ', qrcodeUrl)
          QrcodeTerminal.generate(qrcode, {
            small: true,
          })
        }
      })
      .on('login', (user) => {
        console.log(`User ${user} logined`)
        resolve(bot)
      })
      .on('error', onError)
      .start()
  })
