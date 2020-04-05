import http from 'http'
import Config from './config'
import { exec } from 'child_process'
import crypto from 'crypto'
import * as path from 'path'

const config = Config.getInstance()
const { WEBHOOK_PORT, WEBHOOK_PATH, PROJECT_DIR } = config

function sign(secret: string, data: string) {
  return `sha1=${crypto.createHmac('sha1', secret).update(data).digest('hex')}`
}

function validteSinature(body: string, headertSinature: string) {
  const signed = sign(config.WEBHOOK_SECRET, body)
  return headertSinature === signed
}

const port = process.env.PORT || WEBHOOK_PORT || 8077
const server = http.createServer((req, res) => {
  const signature = req.headers['x-hub-signature']
  let body = ''
  req
    .on('data', data => {
      body += data.toString()
    })
    .on('end', () => {
      const isValidSinature = validteSinature(body, signature as string)
      if (
        req.url === WEBHOOK_PATH &&
        req.method === 'POST' &&
        isValidSinature
      ) {
        res.writeHead(200)
        res.end()
        const now = +new Date()
        const scriptDir = path.resolve(PROJECT_DIR, 'scripts')
        const exexProcess = exec(`cd ${scriptDir} && sh deploy.sh`, err => {
          if (err) {
            process.stderr.write(String(err))
            console.log('🌟[Notice]: webhook server deploy error', err)
            return
          }
          const cost = +new Date() - now
          console.log(`🌟[Notice]: deploy cost ${cost / 1000 / 60}s`)
        })
        exexProcess.stdout &&
          exexProcess.stdout.on('data', e => {
            console.log(e)
          })
      } else {
        res.writeHead(500)
        res.end()
      }
    })
})

server.listen(port, () => {
  console.log('🌟[Notice]: webhook server start at port ' + port)
})

server.on('error', err => {
  console.error('🌟[Notice]: webhook server error', err)
})
