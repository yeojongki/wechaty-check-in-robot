import 'reflect-metadata'
import Config from './config'
import { connect, findUserByWechat } from './database'
import { initBot } from './bot/wechaty'
import event from './shared/events'
import { EventTypes } from './constants/eventTypes'
import { User } from './entities'
import { Wechaty, Room, Contact } from 'wechaty'
import utils from './shared/utils'
import Messenger from './shared/messenger'
import checkTodayCheckInSchedule from './schedule'
import getNotCheckInUsers from './shared/getNotCheckInUsers'
import { THREE_DAY } from './constants/time'
import Axios from 'axios'

const targetRoomName = Config.getInstance().ROOM_NAME
let isInitUserDataIng = false

async function start() {
  let robot: Wechaty | null = null
  const connection = await connect()

  event.on(EventTypes.CHECK_IN, async ({ wechat, time, name }) => {
    console.log('🌟[Notice]: 开始打卡')
    try {
      let toUpdate = await findUserByWechat(connection, wechat)
      if (!toUpdate) {
        toUpdate = new User()
        toUpdate.wechat = wechat
      }
      toUpdate.checkedIn = time
      toUpdate.wechatName = name
      await connection.getRepository(User).save(toUpdate)
      console.log(`📦[DB]: 打卡数据写入成功`)
    } catch (error) {
      console.log(`📦[DB]: 打卡数据写入失败`, error)
    }
  })

  event.on(EventTypes.ASK_FOR_LEAVE, async ({ wechat, time, name }) => {
    console.log('🌟[Notice]: 开始请假')
    try {
      let toUpdate = await findUserByWechat(connection, wechat)
      if (!toUpdate) {
        toUpdate = new User()
        toUpdate.wechat = wechat
      }
      toUpdate.leaveAt = time
      toUpdate.wechatName = name
      await connection.getRepository(User).save(toUpdate)
      console.log(`📦[DB]: 请假数据写入成功`)
    } catch (error) {
      console.log(`📦[DB]: 请假数据写入失败`, error)
    }
  })

  event.on(EventTypes.CHECK_TODAY_USER_CHECK_IN, async () => {
    console.log('🌟[Notice]: 开始检测今天用户签到记录')

    const { notCheckMap } = await getNotCheckInUsers()
    event.emit(EventTypes.DO_BOT_NOTICE, notCheckMap)
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
            const isInRoom = await room.has(user)
            !isInRoom && toDeleteIds.push(user.id)
            if (isInRoom) {
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

        console.log(`🌟[Notice]: 准备移除昨日未打卡成员`)
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
              notCheckedUsers += `${user.wechatName}、`
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

        console.log(`🌟[Notice]: 准备移除三天都未打卡成员`)
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

      pList.length &&
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
    } catch (error) {
      isInitUserDataIng = false
      console.error(
        '🏹[Event]: 初始化用户信息失败 in FIRST_IN_TARGET_ROOM',
        error,
      )
    }
  })

  event.on(EventTypes.DB_REMOVE_USER, async (toDeleteIds: string[]) => {
    console.log(`📦[DB]: 开始标记用户为已删除: ${toDeleteIds}`)
    const pList: Promise<User>[] = []
    for (const wechat of toDeleteIds) {
      let toSet = await connection.getRepository(User).findOne({ wechat })
      if (toSet) {
        pList.push(connection.getRepository(User).softRemove(toSet))
      }
    }
    pList.length &&
      Promise.all(pList)
        .then(() => {
          console.log(`📦[DB]: 标记用户为已删除成功 - ${toDeleteIds}`)
        })
        .catch((err) => {
          console.error('📦[DB]: 标记用户为已删除数据失败', toDeleteIds, err)
        })
  })

  event.on(EventTypes.GET_TODAY_HISTORY, async () => {
    console.log(`🌟[Notice]: 开始获取历史上的今天`)
    const now = new Date()
    const month = now.getMonth() + 1
    const date = now.getDate()
    const monthStr = month < 10 ? `0${month}` : month
    const dateStr = date < 10 ? `0${date}` : date
    const url = `https://baike.baidu.com/cms/home/eventsOnHistory/${monthStr}.json?_=${+now}`

    Axios.get(url)
      .then(async (res) => {
        const todayKey = `${monthStr}${dateStr}`
        const todayAll: {
          recommend: boolean
          cover: boolean
          title: string
          festival?: string
          year: string
          desc: string
        }[] = res.data[monthStr][todayKey]
        const hasCover = todayAll.filter((i) => i.cover)[0]

        function extracText(str: string, len = str.length - 1) {
          str = str.replace('</a>', '')
          const start = str.indexOf('<a')
          const end = str.indexOf('">')
          let result = str.substring(0, start)
          result += str.substring(end, len)
          return result.replace('">', '')
        }
        const title = extracText(hasCover.title)
        const desc = extracText(hasCover.desc, hasCover.desc.length)

        const wechaty = robot ? robot : await initBot()
        const room = await wechaty.Room.find(targetRoomName)
        if (room) {
          room.say(
            `👀${
              hasCover.festival ? `今天是${hasCover.festival}，` : ''
            }一起来看看${
              hasCover.year
            }年历史上的今天发生了什么吧：\n${title}${desc}`,
          )
        }
      })
      .catch((err) => {
        console.error('🏹[Event]: 获取历史上今天发生错误', err)
      })
  })

  event.on(EventTypes.UPDATE_ROOM_USER, async (toUser: Contact) => {
    const wechaty = robot ? robot : await initBot()
    const room = await wechaty.Room.find(targetRoomName)
    if (room) {
      await room.sync()
      const roomUsers = await room.memberAll()

      const currentUserMap = new Map<string, boolean>()
      roomUsers.forEach((u) => {
        currentUserMap.set(u.id, true)
      })

      const pList: Promise<User>[] = []
      let toChange: string = ''
      for (const user of roomUsers) {
        // { id: boolean }

        let dbUser = await connection
          .getRepository(User)
          .findOne({ wechat: user.id })
        const newName = user.name()
        if (dbUser && dbUser.wechatName !== newName) {
          toChange += `用户名从「${dbUser.wechatName}」变成「${newName}」\n`
          dbUser.wechatName = newName
          pList.push(connection.getRepository(User).save(dbUser))
        }
      }

      const dbUsers = await connection.getRepository(User).find()
      const toDeleteUsers: User[] = dbUsers.filter(
        (u) => !currentUserMap.has(u.wechat),
      )

      if (toDeleteUsers.length) {
        console.log(
          `🌟[Notice]: 以下用户已不在群里：${toDeleteUsers
            .map((u) => `@${u.wechatName}`)
            .join(' ')}`,
        )
        toChange += `${toChange.length ? '\n' : ''}以下用户已不在群里：\n`
        toDeleteUsers.forEach((u) => {
          toChange += `@${u.wechatName}，`
          pList.push(connection.getRepository(User).softRemove(u))
        })
      }

      if (pList.length) {
        console.log(`📦[DB]: 开始更新数据库`)
        Promise.all(pList)
          .then(() => {
            console.log(`📦[DB]: 所有用户信息更新成功 - ${toChange}`)
            toUser.say(toChange)
          })
          .catch((err) => {
            console.error('📦[DB]: 所有用户信息更新失败', toChange, err)
          })
      } else {
        console.log(`🌟[Notice]: 暂无更新~`)
        toUser.say('暂无更新~')
      }
    }
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
            `🌟[Notice]: ${inviter} 邀请了${inviteeList.length}位新成员: ${wechatIdList}`,
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
        room.on('leave', (leaverList, remover) => {
          let nameList = ''
          let wechatIdList = ''
          leaverList.forEach((user) => {
            nameList += `${user.name()},`
            wechatIdList += `${user.id},`
          })
          nameList = nameList.substring(0, nameList.length - 1)
          console.log(
            `🌟[Notice]: ${nameList}离开了群聊${
              remover ? ` by - ${remover.name()}` : ''
            }`,
          )
          Messenger.send('离开群聊名单：', nameList)
        })
      }
    } catch (error) {
      console.error('🏹[Event]: 初始化机器人后发生错误', error)
    }
  })
}

start()
