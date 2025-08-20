import fs from "fs";
import { format, parse } from 'fast-csv';

export async function mergeCommand({files, output}) {
    await mergeCSVs(files, output)
}

async function mergeCSVs(files, output) {
    const seen = new Set();
    const merged = [];

    for (const file of files) {
        await new Promise((resolve, reject) => {
            fs.createReadStream(file)
                .pipe(parse({ headers: true }))
                .on('error', reject)
                .on('data', row => {
                    const key = `${row.readingOrderPosition}|${row.title}|${row.url ?? ''}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        merged.push(row);
                    }
                })
                .on('end', resolve);
        });
    }

    // Sort by readingOrderPosition (numeric)
    merged.sort((a, b) => {
        return parseInt(a.readingOrderPosition.replace(/,/g, '')) -
               parseInt(b.readingOrderPosition.replace(/,/g, ''));
    });

    // Write result
    const writableStream = fs.createWriteStream(output);
    const csvStream = format({ headers: true, objectMode: true });
    csvStream.pipe(writableStream);

    merged.forEach(row => csvStream.write(row));
    csvStream.end();

    console.log(`Merged ${files.length} files into ${output}. Rows: ${merged.length}`);
}