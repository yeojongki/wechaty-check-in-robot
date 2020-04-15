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
 * 解析日期
 * @param time
 * @param format
 */
export function parseTime(
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

export default {
  checkUserDataIsInit,
  setUserDataIsInit,
  getTomorrowZero,
  parseTime,
}
