import fs from 'fs'
import * as path from 'path'
import Config from '@/config'
const config = Config.getInstance()
const USER_INIT_FILE_NAME = `${config.ROOM_NAME}.users-init.json`

/**
 * 判断是否初始化用户房间信息
 */
function checkUserDataIsInit(): boolean {
  return fs.existsSync(path.resolve(__dirname, '..', '..', USER_INIT_FILE_NAME))
}

/**
 * 设置已经初始化用户房间信息
 */
function setUserDataIsInit(): void {
  fs.writeFile(
    path.resolve(__dirname, '..', '..', USER_INIT_FILE_NAME),
    JSON.stringify({ init: true }),
    err => {
      if (err) {
        console.error('🌟[Notice]: 写入初始化文件失败', err)
      }
    },
  )
}

/**
 * 获取当前时间的0点
 * 如 2020/03/30 22:23:23 -> 2020/03/21 00:00:00
 */
function getTomorrowZero(date: Date): Date {
  const day = date.getDate()
  const year = date.getFullYear()
  const month = date.getMonth() + 1

  return new Date(+new Date(`${year}/${month}/${day}`) + 86400000)
}

/**
 * 获取昨天最后一秒的时间
 * 如 2020/04/27 00:23:23 -> 2020/04/26 23:59:59
 */
function getYesterday59s(date: Date): Date {
  const day = date.getDate()
  const year = date.getFullYear()
  const month = date.getMonth() + 1

  const yesterday = new Date(+new Date(`${year}/${month}/${day}`) - 86400000)
  return new Date(
    `${yesterday.getFullYear()}/${
      yesterday.getMonth() + 1
    }/${yesterday.getDate()} 23:59:59`,
  )
}

/**
 * 解析日期
 * @param time
 * @param format
 */
function parseTime(
  time: string | number | Date,
  format = '{y}-{m}-{d} {h}:{i}:{s}',
): string {
  if (!time) return ''
  let date
  if (typeof time === 'object') {
    date = time
  } else {
    if (typeof time === 'string' && /^[0-9]+$/.test(time)) {
      date = parseInt(time)
    }
    if (typeof time === 'number' && time.toString().length === 10) {
      date = time * 1000
    }
    date = new Date(time)
  }
  const formatObj = {
    y: date.getFullYear(),
    m: date.getMonth() + 1,
    d: date.getDate(),
    h: date.getHours(),
    i: date.getMinutes(),
    s: date.getSeconds(),
    a: date.getDay(),
  }
  const time_str = format.replace(/{([ymdhisa])+}/g, (_, key) => {
    // @ts-ignore
    const value = formatObj[key]
    // Note: getDay() returns 0 on Sunday
    if (key === 'a') {
      return ['日', '一', '二', '三', '四', '五', '六'][value]
    }
    return value.toString().padStart(2, '0')
  })
  return time_str
}

const emojiNum = {
  0: '0️⃣',
  1: '1️⃣',
  2: '2️⃣',
  3: '3️⃣',
  4: '4️⃣',
  5: '5️⃣',
  6: '6️⃣',
  7: '7️⃣',
  8: '8️⃣',
  9: '9️⃣',
  10: '🔟️',
}

function genEmojiNum(number: number) {
  // @ts-ignore
  return (number + '')
    .split('')
    .map(i => emojiNum[i])
    .join('')
}

export default {
  checkUserDataIsInit,
  setUserDataIsInit,
  getTomorrowZero,
  getYesterday59s,
  parseTime,
  genEmojiNum,
}
