import fs from "fs";
import { format } from "fast-csv";

export async function writeCSVFile(arrayData, filePath) {
  const fileExists = fs.existsSync(filePath);

  let csvStream;
  let writableStream;

  if (fileExists) {
    csvStream = format({ headers: false, objectMode: true });
    writableStream = fs.createWriteStream(filePath, {
      flags: "a",
      includeEndRowDelimiter: true,
    });
    writableStream.write("\n");
  } else {
    csvStream = format({ headers: true, objectMode: true });
    writableStream = fs.createWriteStream(filePath);
  }

  csvStream.pipe(writableStream);

  arrayData.forEach((row) => {
    csvStream.write(row);
  });

  csvStream.end();
}
