import axios from 'axios'
import fs from 'fs'
import * as path from 'path'

export interface IHistoryTodayItem {
  recommend: boolean
  cover: boolean
  title: string
  festival?: string
  year: string
  desc: string
}

export interface IHistoryToday {
  [k: string]: {
    [k: string]: IHistoryTodayItem[]
  }
}

const prefix = 'bot-history-today'
const getPath = (month: string) => {
  return path.resolve(__dirname, `${prefix}-${month}.data`)
}

function checkHasLocalFile(month: string) {
  if (fs.existsSync(getPath(month))) {
    return true
  }
  return false
}

function readLocalFile(month: string): Promise<IHistoryToday> {
  return new Promise((resolve, reject) => {
    fs.readFile(getPath(month), 'utf-8', (err, data) => {
      if (err) {
        return reject(err)
      }
      resolve(JSON.parse(data))
    })
  })
}

function deleteLastMonthFile(month: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!checkHasLocalFile(month)) return resolve()
    fs.unlink(getPath(month), err => {
      if (err) {
        return reject(err)
      }
      resolve()
    })
  })
}

function writeFileToLocal(filePath: string, data: string) {
  return new Promise((resolve, reject) => {
    fs.writeFile(filePath, data, err => {
      if (err) {
        reject(err)
        fs.writeFileSync(
          path.resolve(__dirname, `${+new Date()}.err.log`),
          String(err),
        )
      } else {
        resolve()
      }
    })
  })
}

function fetchData(url: string): Promise<IHistoryToday> {
  return new Promise((resolve, reject) => {
    axios.get(url).then(res => {
      if (!res.data) return reject()
      return resolve(res.data)
    })
  })
}

function extracText(str: string, len = str.length - 1) {
  str = str.replace('</a>', '')
  const start = str.indexOf('<a')
  const end = str.indexOf('">')
  let result = str.substring(0, start)
  result += str.substring(end, len)
  return result.replace('">', '')
}

export default function getHistoryToday(): Promise<string> {
  return new Promise(async (resolve, reject) => {
    const now = new Date()
    const month = now.getMonth() + 1
    const date = now.getDate()
    const monthStr = month < 10 ? `0${month}` : `${month}`
    const dateStr = date < 10 ? `0${date}` : `${date}`
    const todayKey = `${monthStr}${dateStr}`
    const url = `https://baike.baidu.com/cms/home/eventsOnHistory/${monthStr}.json?_=${+now}`
    const hasLocalFile = checkHasLocalFile(monthStr)
    console.log(
      `🌟[Notice]: 开始获取历史上的今天, 本地${
        hasLocalFile ? '存在' : '不存在'
      }${monthStr}月份数据`,
    )

    try {
      const data = hasLocalFile
        ? await readLocalFile(monthStr)
        : await fetchData(url)
      if (!data || !data[monthStr] || !data[monthStr][todayKey]) {
        console.error(`🏹[Event]: 获取历史上今天数据错误`)
        return
      }
      // 不存在 or 每月 1 号获取 JSON 文件并写入本地
      if (dateStr === '01' || !hasLocalFile) {
        writeFileToLocal(getPath(monthStr), JSON.stringify(data))
        const lastMonthStr =
          month === 1 ? '12' : month < 10 ? `0${month - 1}` : `${month - 1}`
        // 删除上月本地数据文件
        deleteLastMonthFile(lastMonthStr)
      }

      const todayAll: IHistoryTodayItem[] = data[monthStr][todayKey]
      const recommendAll = todayAll.filter(i => i.recommend)

      let toSend: string = ''
      recommendAll.map((item, index) => {
        if (index === 0) {
          toSend += `👀 ${
            item.festival ? `今天是${item.festival}，` : ''
          }一起来看看历史上的今天发生了什么吧：\n\n`
        }
        const title = extracText(item.title)
        toSend += `${item.year}年 - ${extracText(title)}${
          index === recommendAll.length - 1 ? '' : '\n'
        }`
      })
      resolve(toSend)
    } catch (error) {
      reject(error)
      console.error('🏹[Event]: 获取历史上今天发生错误', error)
    }
  })
}
