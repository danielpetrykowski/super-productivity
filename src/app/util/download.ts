import { saveAs } from 'file-saver';
import { Directory, Encoding, Filesystem, WriteFileResult } from '@capacitor/filesystem';
import { IS_ANDROID_WEB_VIEW } from './is-android-web-view';
import { Log } from '../core/log';

export const download = async (filename: string, stringData: string): Promise<void> => {
  const blob = new Blob([stringData], { type: 'text/plain;charset=utf-8' });
  if (IS_ANDROID_WEB_VIEW) {
    await saveStringAsFile(filename, stringData);
  } else {
    saveAs(blob, filename);
  }
};

/**
 * Saves a string content as a file in the app's Documents directory.
 * @param fileName The desired name for the file (e.g., 'my-data.txt', 'report.json').
 * @param content The string content to save.
 */
const saveStringAsFile = async (
  fileName: string,
  content: string,
): Promise<WriteFileResult> => {
  const r = await Filesystem.writeFile({
    path: fileName,
    data: content,
    directory: Directory.Documents,
    encoding: Encoding.UTF8,
    recursive: true,
  });
  Log.log(r);
  return r;
};

// interestingly this can't live in the logs.ts or it leads to weird "window" not found errors
export const downloadLogs = (): void => {
  download('SP-logs.json', Log.exportLogHistory());
};
