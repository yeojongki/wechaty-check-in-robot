import Axios from 'axios'

export default function getHistoryToday(): Promise<string> {
  console.log(`🌟[Notice]: 开始获取历史上的今天`)
  return new Promise((resolve, reject) => {
    const now = new Date()
    const month = now.getMonth() + 1
    const date = now.getDate()
    const monthStr = month < 10 ? `0${month}` : month
    const dateStr = date < 10 ? `0${date}` : date
    const url = `https://baike.baidu.com/cms/home/eventsOnHistory/${monthStr}.json?_=${+now}`

    Axios.get(url)
      .then(async res => {
        console.log(`🌟[Notice]: 成功获取历史上的今天`)
        const todayKey = `${monthStr}${dateStr}`
        const todayAll: {
          recommend: boolean
          cover: boolean
          title: string
          festival?: string
          year: string
          desc: string
        }[] = res.data[monthStr][todayKey]
        const recommendAll = todayAll.filter(i => i.recommend)

        function extracText(str: string, len = str.length - 1) {
          str = str.replace('</a>', '')
          const start = str.indexOf('<a')
          const end = str.indexOf('">')
          let result = str.substring(0, start)
          result += str.substring(end, len)
          return result.replace('">', '')
        }

        let toSend: string = ''
        recommendAll.map((item, index) => {
          if (index === 0) {
            toSend += `👀${
              item.festival ? `今天是${item.festival}` : ''
            }，一起来看看历史上的今天发送了什么吧：\n\n`
          }
          const title = extracText(item.title)
          toSend += `${item.year}年 - ${extracText(title)}${
            index === recommendAll.length - 1 ? '' : '\n'
          }`
        })
        resolve(toSend)
      })
      .catch(err => {
        reject(err)
        console.error('🏹[Event]: 获取历史上今天发生错误', err)
      })
  })
}
