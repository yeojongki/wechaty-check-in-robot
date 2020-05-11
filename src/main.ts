import 'reflect-metadata'
import { MoreThan } from 'typeorm'
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
import { ONE_DAY } from './constants/time'
import getHistoryToday from './shared/getHistoryToday'

const targetRoomName = Config.getInstance().ROOM_NAME
let isInitUserDataIng = false

async function start() {
  let robot: Wechaty | null = null
  const connection = await connect()

  event.on(EventTypes.CHECK_IN, async ({ wechat, now, name }) => {
    try {
      const toUpdate = await findUserByWechat(connection, wechat)
      toUpdate.signedAt = now
      toUpdate.wechatName = name
      await connection.getRepository(User).save(toUpdate)
      console.log(`📦[DB]: 打卡数据写入成功`)
    } catch (error) {
      console.log(`📦[DB]: 打卡数据写入失败`, error)
    }
  })

  event.on(EventTypes.FILL_CARD, async ({ wechat, now, name }) => {
    try {
      const toUpdate = await findUserByWechat(connection, wechat)
      toUpdate.signedAt = utils.getYesterday59s(now)
      toUpdate.wechatName = name
      await connection.getRepository(User).save(toUpdate)
      console.log(`📦[DB]: 补卡数据写入成功`)
    } catch (error) {
      console.log(`📦[DB]: 补卡数据写入失败`, error)
    }
  })

  event.on(EventTypes.ASK_FOR_LEAVE, async ({ wechat, now, from }) => {
    try {
      const toUpdate = await findUserByWechat(connection, wechat)
      const name = from.name()
      // 如果今天已经请假了 则不处理
      if (
        toUpdate.leaveAt &&
        +utils.getTomorrowZero(toUpdate.leaveAt) === +utils.getTomorrowZero(now)
      ) {
        console.log(`🌟[Notice]: ${name} - ${wechat} 已请假 忽略`)
        return
      }

      const wechaty = robot ? robot : await initBot()
      const room = await wechaty.Room.find(targetRoomName)
      if (room) {
        await room.say`${from} 请假成功✅`
      }

      // 不存在则写入当前时间
      if (!toUpdate.lastLeaveAt) {
        toUpdate.lastLeaveAt = now as Date
      }
      if (!toUpdate.leaveAt) {
        toUpdate.leaveAt = now as Date
      }

      toUpdate.lastLeaveAt = toUpdate.leaveAt
      toUpdate.leaveAt = now
      toUpdate.wechatName = name
      toUpdate.weekLeaveCount += 1
      await connection.getRepository(User).save(toUpdate)
      console.log(`📦[DB]: 请假数据写入成功`)
    } catch (error) {
      console.log(`📦[DB]: 请假数据写入失败`, error)
    }
  })

  event.on(EventTypes.CHECK_TODAY_USER_CHECK_IN, async () => {
    console.log('🌟[Notice]: 开始检测今天用户签到记录')

    const { notCheckMap, leaveAtMap } = await getNotCheckInUsers()
    event.emit(EventTypes.DO_YESTERDAY_BOT_NOTICE, notCheckMap, leaveAtMap)
  })

  event.on(
    EventTypes.DO_YESTERDAY_BOT_NOTICE,
    async (notCheckMap, leaveAtMap) => {
      console.log('🌟[Notice]: 开始发布昨天成员未打卡情况')
      try {
        const wechaty = robot ? robot : await initBot()
        const room = await wechaty.Room.find(targetRoomName)
        const toDeleteIds: string[] = []

        if (room) {
          const allUsers = await room.memberAll()
          let notCheckUserNames = ''
          let notCheckUsers: Contact[] = []
          let askForLeaveUsers = ''
          let notCheckCount = 0
          let askForLeaveCount = 0

          for (const user of allUsers) {
            if (notCheckMap[user.id]) {
              const isInRoom = await room.has(user)
              !isInRoom && toDeleteIds.push(user.id)
              if (isInRoom) {
                notCheckCount++
                notCheckUserNames += `@${user.name()} `
                notCheckUsers.push(user)
              }
            }
            if (leaveAtMap[user.id]) {
              const isInRoom = await room.has(user)
              !isInRoom && toDeleteIds.push(user.id)
              if (isInRoom) {
                askForLeaveCount++
                askForLeaveUsers += `@${user.name()} `
              }
            }
          }

          let toSend = '\n'

          // TODO: 名单太长可能需要分多条发送
          if (notCheckCount) {
            console.log(`🌟[Notice]: 昨日未打卡同学如下: ${notCheckUserNames}`)
            toSend += `以上${notCheckCount}位昨日同学没有学习打卡噢，`
          }

          if (askForLeaveCount) {
            console.log(`🌟[Notice]: 昨日请假同学如下: ${askForLeaveUsers}`)
            toSend += `共${askForLeaveCount}位同学请假，`
          }

          // 确定最终发送内容
          // 部分没打卡 or 部分请假
          if (askForLeaveCount || notCheckCount) {
            toSend += '今天快快学习起来吧！'
          }

          // 除了请假的都打了卡
          if (askForLeaveCount && !notCheckCount) {
            toSend =
              '昨日除了请假的，其他同学都完成了打卡，争取全员打卡噢[加油]'
          }

          // 无请假并且所有人完成打卡
          if (!askForLeaveCount && !notCheckCount) {
            toSend = '昨日所有同学都完成了打卡，棒棒哒！[哇]'
          }
          // mentionList 会在消息开始位置
          await room.say(toSend, ...notCheckUsers)

          toDeleteIds.length &&
            console.log(`🌟[Notice]: 准备在数据库中移除已不在群组的成员`) &&
            event.emit(EventTypes.DB_REMOVE_USER, toDeleteIds)
        }
      } catch (error) {
        console.error('🏹[Event]: 发布昨天成员未打卡情况发生错误', error)
      }
    },
  )

  event.on(
    EventTypes.CHECK_THREE_DAY_NOT_CHECK_IN,
    async (
      params:
        | {
            useMessenger: Boolean
            from?: Contact
          }
        | undefined,
    ) => {
      console.log('🌟[Notice]: 开始检测三天内未打卡成员')
      if (!params) {
        params = { useMessenger: true }
      }
      try {
        const now = +new Date()
        const users = await connection.getRepository(User).find()
        const wechaty = robot ? robot : await initBot()
        const room = await wechaty.Room.find(targetRoomName)
        if (room) {
          const roomUsers = await room.memberAll()
          // { id: boolean }
          const roomUsersMap = new Map<string, boolean>()
          roomUsers.forEach(u => {
            roomUsersMap.set(u.id, true)
          })
          const toDeleteIds: string[] = []

          let notCheckedUsers: string = ''

          for (const user of users) {
            if (!user.isWhitelist) {
              // 三天没有签到
              if (
                (!user.signedAt && now - +user.enterRoomDate >= ONE_DAY * 3) ||
                (user.signedAt && now - +user.signedAt >= ONE_DAY * 3)
              ) {
                notCheckedUsers += `@${user.wechatName} `
                if (room) {
                  const isDeleted = !roomUsersMap.has(user.wechat)
                  isDeleted && toDeleteIds.push(user.wechat)
                }
              }
            }
          }

          toDeleteIds.length &&
            console.log(`🌟[Notice]: 准备在数据库中移除已不在群组的成员`) &&
            event.emit(EventTypes.DB_REMOVE_USER, toDeleteIds)

          const { useMessenger, from } = params
          if (notCheckedUsers) {
            notCheckedUsers = notCheckedUsers.substring(
              0,
              notCheckedUsers.length - 1,
            )
            console.log(`🌟[Notice]: 三天都未打卡: ${notCheckedUsers}`)
            useMessenger && Messenger.send(`三天都未打卡： ${notCheckedUsers}`)
            from && from.say(`三天都未打卡: ${notCheckedUsers}`)
          } else {
            from && from.say('三天内所有用户都完成的打卡')
            console.log(`🌟[Notice]: 三天内所有用户都完成的打卡`)
          }
        }
      } catch (error) {
        console.error('🏹[Event]: 检测三天内未打卡成员发生错误', error)
      }
    },
  )

  event.on(EventTypes.CHECK_WEEK_ASK_FOR_LEAVE, async (from?: Contact) => {
    try {
      const usersToAt = await connection.getRepository(User).find({
        where: { weekLeaveCount: MoreThan(0) },
        order: {
          weekLeaveCount: 'DESC',
        },
      })
      const usersToAtMap = new Map<string, number>()
      usersToAt.forEach(u => {
        usersToAtMap.set(u.wechat, u.weekLeaveCount)
      })

      const wechaty = robot ? robot : await initBot()
      const room = await wechaty.Room.find(targetRoomName)
      const mentionList: Contact[] = []
      let usersLeaveStr = ''
      if (room) {
        const roomUsers = await room.memberAll()
        for (const user of roomUsers) {
          if (usersToAtMap.has(user.id)) {
            const name = (await room.alias(user)) || user.name()
            usersLeaveStr += `@${name} - ${usersToAtMap.get(user.id)}次 \n`
            mentionList.push(user)
          }
        }
        if (!mentionList.length) {
          const msg = '7天内没有用户请假'
          console.log(`🌟[Notice]: ${msg}`)
          from && from.say(msg)
          return
        }

        const finalText = `以下是本周请假次数统计：\n${usersLeaveStr}`
        console.log(`🌟[Notice]: ${finalText.replace(/\n/g, '')}`)
        await wechaty.puppet.messageSendText(
          from ? from.id : room.id,
          finalText.replace(/\n$/, ''),
          mentionList.map(c => c.id),
        )

        // 主动查看时 不清空数据
        if (from) return
        console.log(`🌟[Notice]: 开始清空以上用户上周的请假次数`)
        await connection
          .createQueryBuilder()
          .update(User)
          .set({ weekLeaveCount: 0 })
          .where(usersToAt.map(i => ({ wechat: i.wechat })))
          .execute()
        console.log(`🌟[Notice]: 成功清空✅`)
      }
    } catch (error) {
      console.error('🏹[Event]: 统计一周内请假情况错误', error)
    }
  })

  event.on(
    EventTypes.CUSTOM_SEND_MESSAGE,
    async (
      type: 'user' | 'room' | 'room@',
      from: Contact,
      roomOrUser: string,
      text: string,
      names?: string[],
    ) => {
      const wechaty = robot ? robot : await initBot()
      if (type === 'user') {
        console.log(`🌟[Notice]: 开始查找用户 - ${roomOrUser}`)
        const user = await wechaty.Contact.find(roomOrUser)
        if (user) {
          await user.say(text)
          console.log(`🌟[Notice]: 已发送消息 - ${text}`)
        } else {
          await from.say(`用户不存在 - ${roomOrUser}`)
        }
      }
      if (type === 'room') {
        const room = await wechaty.Room.find(roomOrUser)
        if (room) {
          await room.say(text)
          console.log(`🌟[Notice]: 已发送消息 - ${text}`)
        } else {
          await from.say(`群组不存在 - ${roomOrUser}`)
        }
      }
      if (type === 'room@') {
        const room = await wechaty.Room.find(roomOrUser)
        if (room) {
          let mentionList: Contact[] = []
          if (names && names.length > 0) {
            for (const name of names) {
              const user = await room.member(name)
              user && mentionList.push(user)
            }
          }
          await wechaty.puppet.messageSendText(
            room.id,
            text,
            mentionList.map(c => c.id),
          )
          console.log(`🌟[Notice]: 已发送消息 - ${text}`)
        } else {
          await from.say(`群组不存在 - ${roomOrUser}`)
        }
      }
    },
  )

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
          .catch(err => {
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
        .catch(err => {
          console.error('📦[DB]: 标记用户为已删除数据失败', toDeleteIds, err)
        })
  })

  event.on(
    EventTypes.EDIT_USER_SIGN_AT_DATE,
    async (from: Contact, wechatOrName: string, date: Date) => {
      console.log(`📦[DB]: 修改用户签到日期: ${wechatOrName} - ${date}`)
      const repository = connection.getRepository(User)

      let user = await repository.findOne({
        where: [{ wechat: wechatOrName }, { wechatName: wechatOrName }],
      })
      if (user) {
        const lastDate = user.signedAt
        console.log(`📦[DB]: 修改前日期: ${date}`)
        user.signedAt = date
        await repository.save(user)
        await from.say(
          `✅修改成功 - @${wechatOrName}\n修改前：${
            lastDate ? utils.parseTime(lastDate) : '无'
          }\n修改后：${utils.parseTime(date)}`,
        )
      } else {
        console.log(`📦[DB]: 该用户不存在 - ${wechatOrName}`)
        await from.say(`该用户不存在 - ${wechatOrName}`)
      }
    },
  )

  event.on(EventTypes.GET_TODAY_HISTORY, async () => {
    console.log(`🌟[Notice]: 开始获取历史上的今天`)
    const toSend = await getHistoryToday()
    const wechaty = robot ? robot : await initBot()
    const room = await wechaty.Room.find(targetRoomName)
    room && room.say(toSend)
  })

  event.on(EventTypes.UPDATE_ROOM_USER, async (toUser?: Contact) => {
    const wechaty = robot ? robot : await initBot()
    const room = await wechaty.Room.find(targetRoomName)
    if (room) {
      await room.sync()
      const roomUsers = await room.memberAll()

      const currentUserMap = new Map<string, boolean>()
      roomUsers.forEach(u => {
        currentUserMap.set(u.id, true)
      })

      const pList: Promise<User>[] = []
      let toChange: string = ''
      const repository = connection.getRepository(User)
      for (const user of roomUsers) {
        // { id: boolean }

        let dbUser = await repository.findOne({ wechat: user.id })
        const newName = user.name()
        // 用户不存在数据库中 新增用户
        if (!dbUser) {
          const newUser = new User()
          newUser.enterRoomDate = new Date()
          newUser.wechat = user.id
          newUser.wechatName = newName
          pList.push(connection.getRepository(User).save(newUser))
          toChange += `新增用户「${user.id}」-「${newName}」\n`
        }
        if (dbUser && dbUser.wechatName !== newName) {
          toChange += `「${dbUser.wechatName}」修改了微信名 ➡️「${newName}」\n`
          dbUser.wechatName = newName
          pList.push(repository.save(dbUser))
        }
      }

      const dbUsers = await repository.find()
      const toDeleteUsers: User[] = dbUsers.filter(
        u => !currentUserMap.has(u.wechat),
      )

      if (toDeleteUsers.length) {
        console.log(
          `🌟[Notice]: 以下用户已不在群里：${toDeleteUsers
            .map(u => `@${u.wechatName}`)
            .join(' ')}`,
        )
        toChange += `${toChange.length ? '\n' : ''}以下用户已不在群里：\n`
        toDeleteUsers.forEach(u => {
          toChange += `@${u.wechatName}，`
          pList.push(connection.getRepository(User).softRemove(u))
        })
      }

      if (pList.length) {
        console.log(`📦[DB]: 开始更新数据库`)
        Promise.all(pList)
          .then(() => {
            console.log(`📦[DB]: 所有用户信息更新成功 - ${toChange}`)
            toUser && toUser.say(toChange)
          })
          .catch(err => {
            console.error('📦[DB]: 所有用户信息更新失败', toChange, err)
          })
      } else {
        console.log(`🌟[Notice]: 暂无更新~`)
        toUser && toUser.say('暂无更新~')
      }
    }
  })

  initBot().then(async bot => {
    checkTodayCheckInSchedule()
    robot = bot

    try {
      const room = await bot.Room.find(targetRoomName)
      if (room) {
        room.on('join', async (inviteeList, inviter) => {
          let nameList = ''
          let wechatIdList = ''
          inviteeList.forEach(user => {
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
          inviteeList.forEach(newUser => {
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
            .catch(err => {
              console.error('📦[DB]: 写入新用户数据失败', wechatIdList, err)
            })
        })
        room.on('leave', (leaverList, remover) => {
          console.log(`🌟[Notice]: 检测到有人离开了群聊`)
          let nameList = ''
          let wechatIdList = ''
          const toDeleteIds: string[] = []
          leaverList.forEach(user => {
            nameList += `${user.name()},`
            wechatIdList += `${user.id},`
            toDeleteIds.push(user.id)
          })
          nameList = nameList.substring(0, nameList.length - 1)
          console.log(
            `🌟[Notice]: ${nameList}离开了群聊 id为${wechatIdList}${
              remover ? ` by - ${remover.name()}` : ''
            }`,
          )
          event.emit(EventTypes.DB_REMOVE_USER, toDeleteIds)
          Messenger.send('离开群聊名单：', nameList)
        })
      }
    } catch (error) {
      console.error('🏹[Event]: 初始化机器人后发生错误', error)
    }
  })
}

start()
