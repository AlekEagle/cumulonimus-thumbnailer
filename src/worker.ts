import { exec } from 'child_process';
import worker from 'worker_threads';
import fileType from 'file-type';

if (worker.isMainThread) throw new Error("can't be ran as main thread");
(async function () {
  let a = await fileType.fromFile(`/var/www-uploads/${worker.workerData.file}`);
  if (a === undefined) {
    worker.parentPort.postMessage(415);
    process.exit(0);
  }
  if (a.mime.startsWith('video') || a.mime.startsWith('image')) {
    if (a.mime.startsWith('video'))
      exec(
        `ffmpeg -ss 00:00:01.00 -i /var/www-uploads/${worker.workerData.file} -vf 'scale=256:256:force_original_aspect_ratio=decrease' -vframes 1 /tmp/cumulonimbus-preview-cache/${worker.workerData.file}.webp`,
        (error, stdout, stderr) => {
          if (error) {
            worker.parentPort.postMessage(500);
            console.error(error, stderr, stdout);
            process.exit(0);
          } else {
            worker.parentPort.postMessage(200);
            process.exit(0);
          }
        }
      );
    else {
      exec(
        `ffmpeg -i /var/www-uploads/${worker.workerData.file} -vf 'scale=256:256:force_original_aspect_ratio=decrease' -vframes 1 /tmp/cumulonimbus-preview-cache/${worker.workerData.file}.webp`,
        (error, stdout, stderr) => {
          if (error) {
            worker.parentPort.postMessage(500);
            console.error(error, stderr, stdout);
            process.exit(0);
          } else {
            worker.parentPort.postMessage(200);
            process.exit(0);
          }
        }
      );
    }
  } else {
    worker.parentPort.postMessage(415);
    process.exit(0);
  }
})();
