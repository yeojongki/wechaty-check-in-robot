import http from 'http'
import Config from './src/config'
import { exec } from 'child_process'
import crypto from 'crypto'
import * as path from 'path'

interface Commit {
  added: string[]
  modified: string[]
}

const config = Config.getInstance()
const { WEBHOOK_PORT, WEBHOOK_PATH, PROJECT_DIR, PROJECT_BRANCH } = config

function sign(secret: string, data: string) {
  return `sha1=${crypto.createHmac('sha1', secret).update(data).digest('hex')}`
}

function validteSinature(body: string, headertSinature: string) {
  const signed = sign(config.WEBHOOK_SECRET, body)
  return headertSinature === signed
}

function shouldDeploy(bodyStr: string) {
  const body = JSON.parse(bodyStr)
  const commits: Commit[] = body.commits
  const includePath = 'src'
  for (const commit of commits) {
    for (const item of commit.added) {
      if (item.startsWith(includePath)) {
        return true
      }
    }
    for (const item of commit.modified) {
      if (item.startsWith(includePath)) {
        return true
      }
    }
  }

  console.log('🌟[Webhook Server]: not modified')
  return false
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
      const isModified = shouldDeploy(body)

      const isValidSinature = validteSinature(body, signature as string)
      if (
        req.url === WEBHOOK_PATH &&
        req.method === 'POST' &&
        isValidSinature &&
        isModified
      ) {
        res.writeHead(200)
        res.end()
        const now = +new Date()
        const scriptDir = path.resolve(PROJECT_DIR, 'scripts')
        const exexProcess = exec(
          `cd ${scriptDir} && git checkout ${PROJECT_BRANCH} && sh deploy.sh`,
          err => {
            if (err) {
              process.stderr.write(String(err))
              console.log('🌟[Webhook Server]: deploy error', err)
              return
            }
            const cost = +new Date() - now
            console.log(`🌟[Webhook Server]: deploy cost ${cost / 1000 / 60}s`)
          },
        )
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
  console.log('🌟[Webhook Server]: start at port ' + port)
})

server.on('error', err => {
  console.error('🌟[Webhook Server]: error', err)
})
