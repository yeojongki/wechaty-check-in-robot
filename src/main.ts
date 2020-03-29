import 'reflect-metadata'
import Config from './config'
import { connect, findUserByWechat } from './database'
import { initBot } from './bot/wechaty'
import event from './shared/events'
import { EventTypes } from './constants/eventTypes'
import { User } from './entities'
import { Wechaty, Room } from 'wechaty'
import shared from './shared/utils'
import Messenger from './shared/messenger'
import checkTodayCheckInSchedule from './schedule'

const targetRoomName = Config.getInstance().ROOM_NAME
let isInitUserDataIng = false

async function start() {
  let robot: Wechaty | null = null
  const connection = await connect()

  event.on(EventTypes.CHECK_IN, async ({ wechat, time }) => {
    try {
      let toUpdate = await findUserByWechat(connection, wechat)
      if (toUpdate) {
        toUpdate.checkedIn = time
      } else {
        toUpdate = new User()
        toUpdate.wechat = wechat
        toUpdate.checkedIn = time
      }
      await connection.getRepository(User).save(toUpdate)
      console.log(`📦[DB]: 打卡数据写入成功 - 用户「${wechat}」`)
    } catch (error) {
      console.log(`📦[DB]: 打卡数据写入失败 - 用户「${wechat}」`, error)
    }
  })

  event.on(EventTypes.ASK_FOR_LEAVE, async ({ wechat, time }) => {
    try {
      let toUpdate = await findUserByWechat(connection, wechat)
      if (toUpdate) {
        toUpdate.leaveAt = time
      } else {
        toUpdate = new User()
        toUpdate.wechat = wechat
        toUpdate.leaveAt = time
      }
      await connection.getRepository(User).save(toUpdate)
      console.log(`📦[DB]: 请假数据写入成功 - 用户「${wechat}」`)
    } catch (error) {
      console.log(`📦[DB]: 请假数据写入失败 - 用户「${wechat}」`, error)
    }
  })

  event.on(EventTypes.CHECK_TODAY_USER_CHECK_IN, async () => {
    const now = +new Date()
    const users = await connection.getRepository(User).find()
    const notCheckedMap: Record<string, boolean> = {}
    const whiteListMap = shared.getWhiteListMap()
    const ONE_DAY = 86400 * 1000

    for (const user of users) {
      // 排除白名单和当天请假的
      if (
        whiteListMap[user.wechat] ||
        (user.leaveAt && now - +user.leaveAt < ONE_DAY)
      ) {
        continue
      } else {
        // 没有签到记录或者今天没有签到
        if (
          (!user.checkedIn && now - +user.enterRoomDate > ONE_DAY) ||
          (user.checkedIn && now - +user.checkedIn > ONE_DAY)
        ) {
          notCheckedMap[user.wechat] = true
        }
      }
    }
    event.emit(EventTypes.DO_BOT_NOTICE, notCheckedMap)
  })

  event.on(EventTypes.DO_BOT_NOTICE, async (wechatIdMap) => {
    try {
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

        console.log(`🌟[Notice]: 昨日未打卡同学如下, ${usersToAt}`)

        // TODO: 名单太长可能需要分多条发送
        if (count) {
          room.wechaty.say(
            usersToAt +
              `以上${count}位同学昨日没有学习打卡噢，今天快快学习起来吧！`,
          )
        }
      }
    } catch (error) {
      console.error('🏹[Event]: error in DO_BOT_NOTICE', error)
    }
  })

  event.on(EventTypes.CHECK_THREE_DAY_NOT_CHECK_IN, async () => {
    const now = +new Date()
    const users = await connection.getRepository(User).find()
    let notCheckedUsers: string = ''
    const whiteListMap = shared.getWhiteListMap()
    const THREE_DAY = 86400 * 3 * 1000
    users.forEach((user) => {
      if (!whiteListMap[user.wechat]) {
        // 三天没有签到
        if (
          (user.checkedIn && now - +user.checkedIn > THREE_DAY) ||
          (!user.checkedIn && now - +user.enterRoomDate > THREE_DAY)
        ) {
          notCheckedUsers += `${user.wechat}、`
        }
      }
    })

    notCheckedUsers = notCheckedUsers.substring(0, notCheckedUsers.length - 1)
    console.log(`🌟[Notice]: 三天都未打卡: ${notCheckedUsers}`)
    notCheckedUsers &&
      Messenger.send(`${new Date()} 三天都未打卡： ${notCheckedUsers}`)
  })

  event.on(EventTypes.FIRST_IN_TARGET_ROOM, async (room: Room) => {
    if (isInitUserDataIng) return
    isInitUserDataIng = true
    // 初始化
    console.log('🌟[Notice]: 首次进入房间, 开始初始化用户信息')
    try {
      const roomUsers = await room.memberAll()
      const pList: Promise<User>[] = []
      const now = new Date()

      for (const roomUser of roomUsers) {
        let toUpdate = await connection
          .getRepository(User)
          .findOne({ wechat: roomUser.id })
        if (toUpdate) {
          toUpdate.enterRoomDate = now
          toUpdate.wechatName = roomUser.name()
        } else {
          toUpdate = new User()
          toUpdate.enterRoomDate = now
          toUpdate.wechat = roomUser.id
          toUpdate.wechatName = roomUser.name()
        }
        pList.push(connection.getRepository(User).save(toUpdate))
      }

      if (pList.length) {
        Promise.all(pList)
          .then(() => {
            console.log(`📦[DB]: 写入初始化${pList.length}位用户信息成功`)
            shared.setUserDataIsInit()
          })
          .catch((err) => {
            console.error('📦[DB]: 写入初始化用户信息失败', err)
          })
          .finally(() => {
            isInitUserDataIng = false
          })
      }
    } catch (error) {
      isInitUserDataIng = false
      console.error(
        '🏹[Event]: 初始化用户信息失败 in FIRST_IN_TARGET_ROOM',
        error,
      )
    }
  })

  initBot().then(async (bot) => {
    checkTodayCheckInSchedule()
    robot = bot

    try {
      const room = await bot.Room.find(targetRoomName)
      if (room) {
        room
          .on('join', (inviteeList, inviter) => {
            let nameList = ''
            let wechatIdList = ''
            inviteeList.forEach((user) => {
              nameList += `${user.name()},`
              wechatIdList += `${user.id},`
            })
            nameList = nameList.substring(0, nameList.length - 1)
            wechatIdList = wechatIdList.substring(0, wechatIdList.length - 1)

            room.say('欢迎新同学加入[加油]')
            console.log(
              `🌟[Notice]: ${inviter} 邀请了${inviteeList.length}位新成员: ${nameList}`,
            )
            console.log(`📦[DB]: 开始写入新用户信息: ${nameList}`)

            const pList: Promise<User>[] = []
            inviteeList.forEach((newUser) => {
              const user = new User()
              user.enterRoomDate = new Date()
              user.wechat = newUser.id
              user.wechatName = newUser.name()
              pList.push(connection.getRepository(User).save(user))
            })
            Promise.all(pList)
              .then(() => {
                console.log(`📦[DB]: 写入新用户数据成功 - ${wechatIdList}`)
              })
              .catch((err) => {
                console.error('📦[DB]: 写入新用户数据失败', wechatIdList, err)
              })
          })
          .on('leave', async (leaverList, remover) => {
            let nameList = ''
            let wechatIdList = ''
            leaverList.forEach((user) => {
              nameList += `${user.name()},`
              wechatIdList += `${user.id},`
            })
            nameList = nameList.substring(0, nameList.length - 1)
            wechatIdList = wechatIdList.substring(0, wechatIdList.length - 1)

            console.log(
              `🌟[Notice]: ${remover} 移除了${leaverList.length}位成员: ${nameList}`,
            )
            console.log(`📦[DB]: 开始写入移除成员数据: ${nameList}`)

            const pList: Promise<User>[] = []
            for (const roomUser of leaverList) {
              let toSet = await connection
                .getRepository(User)
                .findOne({ wechat: roomUser.id })
              if (toSet) {
                pList.push(connection.getRepository(User).softRemove(toSet))
              }
            }

            Promise.all(pList)
              .then(() => {
                console.log(
                  `📦[DB]: 写入移出群聊数据成功 - ${leaverList}`,
                  wechatIdList,
                )
              })
              .catch((err) => {
                console.error(
                  '📦[DB]: 写入用户移出群聊数据失败',
                  wechatIdList,
                  err,
                )
              })
          })
      }
    } catch (error) {
      console.error('🏹[Event]: find room error in initBot().then()', error)
    }
  })
}

start()
