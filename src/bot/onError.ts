import Messenger from '@/shared/messenger'
import Config from '@/config'

export function onError(err: Error) {
  Messenger.send(
    `${Config.getInstance().BOT_NAME}出错`,
    `
    - 时间：${new Date().toLocaleString()}
    - error：${JSON.stringify(err)}
  `,
  )
}
