import 'reflect-metadata'
import Config from './config'
import { connect, findUserByWechat } from './database'
import { initBot } from './bot/wechaty'
import event from './shared/events'
import { EventTypes } from './constants/eventTypes'
import { User } from './entities'
import { Wechaty, Room } from 'wechaty'
import utils from './shared/utils'
import Messenger from './shared/messenger'
import checkTodayCheckInSchedule from './schedule'
import getNotCheckInUsers from './shared/getNotCheckInUsers'
import { THREE_DAY } from './constants/time'

const targetRoomName = Config.getInstance().ROOM_NAME
let isInitUserDataIng = false

async function start() {
  let robot: Wechaty | null = null
  const connection = await connect()

  event.on(EventTypes.CHECK_IN, async ({ wechat, time }) => {
    console.log('🌟[Notice]: 开始打卡')
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
    console.log('🌟[Notice]: 开始请假')
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
    console.log('🌟[Notice]: 开始检测今天用户签到记录')

    const notCheckedMap:
      | Record<string, boolean>
      | undefined = await getNotCheckInUsers()
    event.emit(EventTypes.DO_BOT_NOTICE, notCheckedMap)
  })

  event.on(EventTypes.DO_BOT_NOTICE, async (wechatIdMap) => {
    console.log('🌟[Notice]: 开始发布昨天成员未打卡情况')
    try {
      const wechaty = robot ? robot : await initBot()
      const room = await wechaty.Room.find(targetRoomName)
      const toDeleteIds: string[] = []

      if (room) {
        const allUsers = await room.memberAll()
        let usersToAt = ''
        let count = 0

        for (const user of allUsers) {
          if (wechatIdMap[user.id]) {
            const isDeleted = await room.has(user)
            isDeleted && toDeleteIds.push(user.id)
            if (!isDeleted) {
              count++
              usersToAt += `@${user.name()} `
            }
          }
        }

        console.log(`🌟[Notice]: 昨日未打卡同学如下: ${usersToAt}`)

        // TODO: 名单太长可能需要分多条发送
        if (count) {
          await room.say(
            usersToAt +
              `以上${count}位同学昨日没有学习打卡噢，今天快快学习起来吧！`,
          )
        }

        toDeleteIds.length && event.emit(EventTypes.DB_REMOVE_USER, toDeleteIds)
      }
    } catch (error) {
      console.error('🏹[Event]: 发布昨天成员未打卡情况发生错误', error)
    }
  })

  event.on(EventTypes.CHECK_THREE_DAY_NOT_CHECK_IN, async () => {
    console.log('🌟[Notice]: 开始检测三天内未打卡成员')
    try {
      const now = +new Date()
      const users = await connection.getRepository(User).find()
      const wechaty = robot ? robot : await initBot()
      const room = await wechaty.Room.find(targetRoomName)
      if (room) {
        const roomUsers = await room.memberAll()
        // { id: boolean }
        const roomUsersMap = new Map<string, boolean>()
        roomUsers.forEach((u) => {
          roomUsersMap.set(u.id, true)
        })
        const toDeleteIds: string[] = []

        let notCheckedUsers: string = ''

        for (const user of users) {
          if (!user.isWhiteList) {
            // 三天没有签到
            if (
              (user.checkedIn && now - +user.checkedIn > THREE_DAY) ||
              (!user.checkedIn && now - +user.enterRoomDate > THREE_DAY)
            ) {
              notCheckedUsers += `${user.wechat}、`
              if (room) {
                const isDeleted = !roomUsersMap.get(user.wechat)
                isDeleted && toDeleteIds.push(user.wechat)
              }
            }
          }
        }

        notCheckedUsers = notCheckedUsers.substring(
          0,
          notCheckedUsers.length - 1,
        )
        if (notCheckedUsers) {
          console.log(`🌟[Notice]: 三天都未打卡: ${notCheckedUsers}`)
          Messenger.send(`三天都未打卡： ${notCheckedUsers}`)
        }

        toDeleteIds.length && event.emit(EventTypes.DB_REMOVE_USER, toDeleteIds)
      }
    } catch (error) {
      console.error('🏹[Event]: 检测三天内未打卡成员发生错误', error)
    }
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
            utils.setUserDataIsInit()
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

  event.on(EventTypes.DB_REMOVE_USER, async (toDeleteIds: string[]) => {
    console.log(`📦[DB]: 开始移除群成员数据: ${toDeleteIds}`)
    const pList: Promise<User>[] = []
    for (const wechat of toDeleteIds) {
      let toSet = await connection.getRepository(User).findOne({ wechat })
      if (toSet) {
        pList.push(connection.getRepository(User).softRemove(toSet))
      }
    }
    Promise.all(pList)
      .then(() => {
        console.log(`📦[DB]: 移除群成员数据成功 - ${toDeleteIds}`)
      })
      .catch((err) => {
        console.error('📦[DB]: 移除群成员数据数据失败', toDeleteIds, err)
      })
  })

  initBot().then(async (bot) => {
    checkTodayCheckInSchedule()
    robot = bot

    try {
      const room = await bot.Room.find(targetRoomName)
      if (room) {
        room.on('join', async (inviteeList, inviter) => {
          let nameList = ''
          let wechatIdList = ''
          inviteeList.forEach((user) => {
            nameList += `${user.name()},`
            wechatIdList += `${user.id},`
          })
          nameList = nameList.substring(0, nameList.length - 1)
          wechatIdList = wechatIdList.substring(0, wechatIdList.length - 1)

          await room.say(
            '欢迎新同学加入[加油]，打卡规则请看群公告，有不清楚的可以在群里问~',
          )
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
      }
    } catch (error) {
      console.error('🏹[Event]: 初始化机器人后发生错误', error)
    }
  })
}

start()
