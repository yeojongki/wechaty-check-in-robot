require('module-alias/register')
import 'reflect-metadata'
import Config from './config'
import { connect, findUserByWechat } from './database'
import { initBot } from './bot/wechaty'
import event from '@/shared/events'
import { EventTypes } from './constants/eventTypes'
import { User } from './entities'
import { Wechaty } from 'wechaty'
import getWhiteListMap from './shared/getWhiteListMap'
import Messenger from './shared/messenger'
import { onMessage } from './bot/onMessage'

const targetRoomName = Config.getInstance().ROOM_NAME

async function start() {
  let robot: Wechaty | null = null
  const connection = await connect()

  event.on(EventTypes.CHECK_IN, async ({ wechat, time }) => {
    let user = await findUserByWechat(connection, wechat)
    if (user) {
      user.checkedIn = time
    } else {
      user = new User()
      user.wechat = wechat
      user.checkedIn = time
    }
    await connection.getRepository(User).save(user)
  })

  event.on(EventTypes.ASK_FOR_LEAVE, async ({ wechat, time }) => {
    let user = await findUserByWechat(connection, wechat)
    if (user) {
      user.leaveAt = time
    } else {
      user = new User()
      user.wechat = wechat
      user.leaveAt = time
    }
    await connection.getRepository(User).save(user)
  })

  event.on(EventTypes.CHECK_TODAY_USER_CHECK_IN, async () => {
    const now = +new Date()
    const users = await connection.getRepository(User).find()
    const notCheckedMap: Record<string, boolean> = {}
    const whiteListMap = getWhiteListMap()

    users.forEach((user) => {
      // 排除白名单和当天请假的
      if (
        !whiteListMap[user.wechat] ||
        (user.leaveAt && now - +user.leaveAt < 86400)
      ) {
        // 没有签到记录或者今天没有签到
        if (
          !user.checkedIn ||
          (user.checkedIn && now - +user.checkedIn > 86400)
        ) {
          notCheckedMap[user.wechat] = true
        }
      }
      event.emit(EventTypes.DO_BOT_NOTICE, notCheckedMap)
    })
  })

  event.on(EventTypes.DO_BOT_NOTICE, async (wechatIdMap) => {
    const wechaty = robot ? robot : await initBot()
    const room = await wechaty.Room.find(targetRoomName)
    if (room) {
      const allUsers = await room.memberAll()
      let usersToAt = ''
      let count = 0

      allUsers.forEach((user) => {
        if (wechatIdMap[user.id]) {
          count++
          usersToAt += `@${user.name()} `
        }
      })

      // TODO: 名单太长可能需要分多条发送
      if (count) {
        room.wechaty.say(
          usersToAt +
            `以上${count}位同学昨日没有学习打卡噢，今天快快学习起来把！已请假的同学可忽略~`,
        )
      }
    } else {
      console.info('not found target room', targetRoomName)
    }
  })

  event.on(EventTypes.CHECK_THREE_DAY_NOT_CHECK_IN, async () => {
    const now = +new Date()
    const users = await connection.getRepository(User).find()
    let notCheckedUsers: string = ''
    const whiteListMap = getWhiteListMap()
    const THREE_DAY = 86400 * 3
    users.forEach((user) => {
      if (!whiteListMap[user.wechat]) {
        // 三天没有签到
        if (
          (user.checkedIn && now - +user.checkedIn > THREE_DAY) ||
          (!user.checkedIn && now - +user.enterRoomDate > THREE_DAY)
        ) {
          notCheckedUsers += `${user.wechat} `
        }
      }
    })
    notCheckedUsers && Messenger.send('三天都没打卡的人', notCheckedUsers)
  })

  initBot().then(async (bot) => {
    robot = bot
    const room = await bot.Room.find(targetRoomName)
    if (room) {
      const dbUsers = await connection.getRepository(User).count()
      if (dbUsers > 0) return

      // 初始化
      const roomUsers = await room.memberAll()
      const pList: Promise<User>[] = []
      roomUsers.forEach((roomUser) => {
        const user = new User()
        user.enterRoomDate = new Date()
        user.wechat = roomUser.id
        user.wechatName = roomUser.name()
        pList.push(connection.getRepository(User).save(user))
      })

      if (pList.length) {
        Promise.all(pList).then(() => {
          bot.on('message', onMessage)
        })
      } else {
        bot.on('message', onMessage)
      }
    }
  })
}

start()
