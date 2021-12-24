import { exec } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import worker from 'worker_threads';
import fileType from 'file-type';
import Express from 'express';
import cors from 'cors';
import compression, { filter as _filter } from 'compression';

function shouldCompress(req: Express.Request, res: Express.Response): boolean {
  if (req.headers['x-no-compression']) {
    return false;
  }
}

const port: number =
  8100 + (!process.env.instance ? 0 : Number(process.env.instance));
const app = Express();

app.use(
  cors({
    origin: true
  }),
  compression({ filter: shouldCompress })
);

if (!existsSync('/tmp/cumulonimbus-preview-cache'))
  mkdirSync('/tmp/cumulonimbus-preview-cache');

app.get('/:file', async (req, res) => {
  if (existsSync(`/tmp/cumulonimbus-preview-cache/${req.params.file}.webp`)) {
    console.debug('Preview cached, not generating another.');
    res
      .append('Content-Type', 'image/webp')
      .sendFile(`/tmp/cumulonimbus-preview-cache/${req.params.file}.webp`);
    return;
  }
  if (!existsSync(`/var/www-uploads/${req.params.file}`)) {
    console.debug('File does not exist. File: ', req.params.file);
    res.status(404).end();
    return;
  }
  let thumbWorker = new worker.Worker('./dist/worker.js', {
    workerData: {
      file: req.params.file
    }
  });
  thumbWorker.on('online', () => {
    console.debug('Generating...');
  });
  thumbWorker.on('exit', () => {
    console.debug('Done');
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

app.listen(port);
