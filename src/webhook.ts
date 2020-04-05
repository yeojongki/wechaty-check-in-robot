import http from 'http'
import Config from './config'
import { exec } from 'child_process'
import crypto from 'crypto'

const config = Config.getInstance()
const { WEBHOOK_PORT, WEBHOOK_PATH } = config

function validteSinature(body: string, headertSinature: string) {
  const hmac = crypto.createHmac('sha1', config.WEBHOOK_SECRET)
  hmac.update(body, 'utf8')
  const signature = `sha1=${hmac.digest('hex')}`
  return signature === headertSinature
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
        const now = +new Date()
        const exexProcess = exec('cd scripts && sh deploy.sh', err => {
          if (err) {
            process.stderr.write(String(err))
            console.log('🌟[Notice]: webhook server deploy error', err)
            res.writeHead(500)
            res.end()
            return
          }
          const cost = +new Date() - now
          console.log(`🌟[Notice]: deploy cost ${cost / 1000 / 60}s`)
          res.writeHead(200)
          res.end()
        })
        exexProcess.stdout &&
          exexProcess.stdout.on('data', e => {
            console.log(e)
          })
      } else {
        res.writeHead(404)
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
