import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import worker from 'node:worker_threads';
import Express from 'express';
import Logger, { Level } from './Logger';
import compression, { filter as _filter } from 'compression';
const packageJSON = JSON.parse(readFileSync('./package.json', 'utf8'));

global.console = new Logger(
  process.env.DEBUG ? Level.DEBUG : Level.INFO
) as any;

function shouldCompress(req: Express.Request, res: Express.Response): boolean {
  if (req.headers['x-no-compression']) {
    return false;
  }
}

const port: number =
  8100 + (!process.env.instance ? 0 : Number(process.env.instance));
const app = Express();

app.use(compression({ filter: shouldCompress }));

if (!existsSync('/tmp/cumulonimbus-preview-cache'))
  mkdirSync('/tmp/cumulonimbus-preview-cache');

app.all('/', async (req, res) => {
  res.status(200).json({ hello: 'world', version: packageJSON.version });
});

app.get('/:file', async (req, res) => {
  if (existsSync(`/tmp/cumulonimbus-preview-cache/${req.params.file}.webp`)) {
    console.debug(
      `Preview cached for ${req.params.file}, not generating another.`
    );
    res
      .append('Content-Type', 'image/webp')
      .sendFile(`/tmp/cumulonimbus-preview-cache/${req.params.file}.webp`);
    return;
  }
  if (!existsSync(`/var/www-uploads/${req.params.file}`)) {
    console.debug('File does not exist. File: %s', req.params.file);
    res.status(404).end();
    return;
  }
  let thumbWorker = new worker.Worker('./dist/worker.js', {
    workerData: {
      file: req.params.file
    }
  });
  thumbWorker.on('online', () => {
    console.debug(`Generating preview for ${req.params.file}...`);
  });
  thumbWorker.on('exit', code => {
    if (code === 0)
      console.debug(`Done generating preview for ${req.params.file}.`);
    else console.debug(`Unable to generate preview for ${req.params.file}`);
  });
  thumbWorker.on('message', (status: number) => {
    if (status !== 200) {
      res.status(status).end();
    } else {
      res
        .append('Content-Type', 'image/webp')
        .sendFile(`/tmp/cumulonimbus-preview-cache/${req.params.file}.webp`);
    }
  });
});

app.listen(port, () => {
  console.log(`Listening on port ${port}.`);
});
